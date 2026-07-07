import { Message } from 'discord.js';
import OpenAI from 'openai';
import { generateLLMResponse } from '../lib/llm-client';

const urlRegex = /(https?:\/\/[^\s]+)/g;
const timeoutforReadableFromUrl = 20 * 1000; // 20秒のタイムアウト

async function fetchReadablefromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutforReadableFromUrl); // 8秒でタイムアウト
    const res = await fetch('https://r.jina.ai/' + url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.error(`[JinaReader] URLの取得に失敗しました: ${url} | ステータス: ${res.status} ${res.statusText}`);
      return "(Webページの取得に失敗しました)";
    }
    
    const text = await res.text();
    // トークン上限対策のため、最大2500文字程度でカットする
    return text.length > 2500 ? text.slice(0, 2500) + '\n... (以降省略されました)' : text;
  } catch (e: any) {
    console.error(`[JinaReader] 例外エラーが発生しました: ${url}`, e?.message || e);
    return "(Webページの取得タイムアウトまたはエラー)";
  }
}

export async function handleMessageCreate(message: Message) {
  // Bot自身のメッセージや他のBotのメッセージは無視
  if (message.author.bot) return;

  const client = message.client;
  if (!client.user) return;

  let isTarget = message.mentions.has(client.user.id);

  // メンションされていなくても、Botへのリプライであれば反応する
  if (!isTarget && message.reference?.messageId) {
    try {
      const refMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (refMsg.author.id === client.user.id) {
        isTarget = true;
      }
    } catch (e) {
      // 参照先のメッセージが見つからない（削除済みなど）場合は無視
    }
  }

  // ターゲットでなければ何もしない
  if (!isTarget) return;

  // 環境変数のチェック
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.warn('[LLM] LLM_API_KEY is not set. Ignoring message.');
    return;
  }

  try {
    if ( "sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
      await message.channel.sendTyping();
    }

    // リプライツリーを遡る（最大10件）
    const messageTree: Message[] = [message];
    let currentMsg = message;

    while (currentMsg.reference?.messageId && messageTree.length < 10) {
      try {
        currentMsg = await message.channel.messages.fetch(currentMsg.reference.messageId);
        messageTree.unshift(currentMsg); // 古いメッセージが先頭になるように追加
      } catch (e) {
        break; // 取得できなかったらそこで遡るのをやめる
      }
    }

    // OpenAI用のメッセージフォーマットに変換
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const msg of messageTree) {
      const role = msg.author.id === client.user.id ? 'assistant' : 'user';
      
      // ユーザーのメッセージからBotへのメンション文字列（<@ID>）を削除して整形
      let textContent = msg.content;
      const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
      textContent = textContent.replace(mentionRegex, '').trim();

      const displayName = msg.member?.displayName || msg.author.displayName || msg.author.username;

      // --- 画像添付ファイルの抽出 ---
      const imageUrls: string[] = [];
      msg.attachments.forEach(att => {
        if (att.contentType?.startsWith('image/')) {
          imageUrls.push(att.url);
        }
      });

      // --- テキスト内のURL抽出と処理 ---
      const webUrls: string[] = [];
      let match;
      while ((match = urlRegex.exec(textContent)) !== null) {
        const url = match[1];
        // 簡易的な拡張子チェックで画像か判断 
        if (url.match(/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i)) {
          imageUrls.push(url);
        } else {
          webUrls.push(url);
        }
      }

      // Webページの情報を取得して別のシステムメッセージとして準備
      let systemWebContent = "";
      if (webUrls.length > 0) {
        const fetchPromises = webUrls.map(async (url) => {
          const content = await fetchReadablefromUrl(url);
          return `\n[ URL: ${url} ]\n${content}\n`;
        });
        const results = await Promise.all(fetchPromises);
        systemWebContent = "以下は、会話の中で提示されたWebページの内容です。参考にして返答してください。\n" + results.join("\n");
      }

      // まず通常のメッセージ（テキストや画像）を messages に追加する
      if (imageUrls.length > 0) {
        // 画像が含まれている場合はマルチモーダルフォーマット（配列）にする
        const contentArray: any[] = [];
        if (textContent) {
          contentArray.push({ type: "text", text: role === 'user' ? `"${displayName}": ${textContent}` : textContent });
        } else if (role === 'user') {
          contentArray.push({ type: "text", text: `"${displayName}" が画像を送信しました。` });
        }
        
        // 全ての画像を配列に追加
        for (const url of imageUrls) {
          contentArray.push({ type: "image_url", image_url: { url } });
        }
        
        messages.push({ role, content: contentArray });
      } else {
        // テキストのみの場合
        if (!textContent) {
          textContent = "（無言のメッセージ）";
        }
        messages.push({
          role,
          content: role === 'user' ? `"${displayName}": ${textContent}` : textContent, // ユーザー名（表示名）も文脈として付与
        });
      }

      // Webページのコンテンツがある場合は、直後にシステムメッセージとして独立して追加する
      if (systemWebContent) {
        messages.push({
          role: 'system',
          content: systemWebContent
        });
      }
    }

    // LLMにリクエスト
    const replyContent = await generateLLMResponse(messages);

    if (replyContent) {
      // 長すぎる場合は分割などの処理が必要になる可能性があるが、一旦そのまま返す
      await message.reply(replyContent);
    } else {
      await message.reply("返答を生成できませんでした。");
    }
  } catch (error) {
    console.error('[LLM] OpenAI Error:', error);
    await message.reply('APIリクエスト中にエラーが発生しました。設定やAPIキーを確認してください。');
  }
}
