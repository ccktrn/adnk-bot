import { Message } from 'discord.js';
import OpenAI from 'openai';
import { generateLLMResponse } from '../lib/llm-client';


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
      let content = msg.content;
      const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
      content = content.replace(mentionRegex, '').trim();

      if (!content) {
        content = "（画像または無言のメッセージ）";
      }

      messages.push({
        role,
        content: role === 'user' ? `${msg.author.username}: ${content}` : content, // ユーザー名も文脈として付与
      });
    }

    // LLMにリクエスト
    const replyContent = await generateLLMResponse(messages);

    if (replyContent) {
      // 長すぎる場合は分割などの処理が必要になる可能性があるが、一旦そのまま返す
      await message.reply(replyContent);
    }
  } catch (error) {
    console.error('[LLM] OpenAI Error:', error);
    await message.reply('申し訳ありません、APIリクエスト中にエラーが発生しました。設定やAPIキーを確認してください。');
  }
}
