import { Message } from 'discord.js';
import { generateLLMResponse } from '../lib/llm-client';
import { logger } from '../lib/logger';
import { formatMessagesForLLM } from '../lib/llm-formatter';

const MAX_MESSAGE_LENGTH = 200; // 分割送信する際の1メッセージあたりの最大文字数

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
    logger.warn('[LLM] LLM_API_KEY is not set. Ignoring message.');
    return;
  }

  try {
    if ("sendTyping" in message.channel && typeof message.channel.sendTyping === "function") {
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

    // フォーマット処理を外部モジュールに委譲
    const messages = await formatMessagesForLLM(messageTree, client.user.id);

    // LLMにリクエスト
    const replyContent = await generateLLMResponse(messages, message);

    if (replyContent) {
      // 長すぎる場合は設定した定数(MAX_MESSAGE_LENGTH)ごとに分割
      const chunks = [];
      for (let i = 0; i < replyContent.length; i += MAX_MESSAGE_LENGTH) {
        chunks.push(replyContent.slice(i, i + MAX_MESSAGE_LENGTH));
      }

      let targetMessage: Message = message;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        targetMessage = await targetMessage.reply(chunk);
      }
    } else {
      await message.reply("返答を生成できませんでした。");
    }
  } catch (error) {
    logger.error('Discord: メッセージ送信エラー:', error);
  }
}
