import { Message } from 'discord.js';
import OpenAI from 'openai';
import { logger } from './logger';

const urlRegex = /(https?:\/\/[^\s]+)/g;
const timeoutforReadableFromUrl = 20 * 1000;
const MAX_WEB_CONTENT_LENGTH = 2500;

export async function fetchReadablefromUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutforReadableFromUrl);
    const res = await fetch('https://r.jina.ai/' + url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      logger.error(`[JinaReader] URLの取得に失敗しました: ${url} | ステータス: ${res.status} ${res.statusText}`);
      return "(Webページの取得に失敗しました)";
    }
    
    const text = await res.text();
    return text.length > MAX_WEB_CONTENT_LENGTH ? text.slice(0, MAX_WEB_CONTENT_LENGTH) + '\n... (以降省略されました)' : text;
  } catch (e: any) {
    logger.error(`[JinaReader] 例外エラーが発生しました: ${url}`, e?.message || e);
    return "(Webページの取得タイムアウトまたはエラー)";
  }
}

export async function formatMessagesForLLM(messageTree: Message[], clientId: string): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const msg of messageTree) {
    const role = msg.author.id === clientId ? 'assistant' : 'user';
    
    let textContent = msg.content;
    const mentionRegex = new RegExp(`<@!?${clientId}>`, 'g');
    textContent = textContent.replace(mentionRegex, '').trim();

    const displayName = msg.member?.displayName || msg.author.displayName || msg.author.username;

    const imageUrls: string[] = [];
    msg.attachments.forEach(att => {
      if (att.contentType?.startsWith('image/')) {
        imageUrls.push(att.url);
      }
    });

    const webUrls: string[] = [];
    let match;
    while ((match = urlRegex.exec(textContent)) !== null) {
      const url = match[1];
      if (url.match(/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i)) {
        imageUrls.push(url);
      } else {
        webUrls.push(url);
      }
    }

    let systemWebContent = "";
    if (webUrls.length > 0) {
      const fetchPromises = webUrls.map(async (url) => {
        const content = await fetchReadablefromUrl(url);
        return `\n[ URL: ${url} ]\n${content}\n`;
      });
      const results = await Promise.all(fetchPromises);
      systemWebContent = "以下は、会話の中で提示されたWebページの内容です。参考にして返答してください。\n" + results.join("\n");
    }

    if (imageUrls.length > 0) {
      const contentArray: any[] = [];
      if (textContent) {
        contentArray.push({ type: "text", text: role === 'user' ? `"${displayName}": ${textContent}` : textContent });
      } else if (role === 'user') {
        contentArray.push({ type: "text", text: `"${displayName}" が画像を送信しました。` });
      }
      
      for (const url of imageUrls) {
        contentArray.push({ type: "image_url", image_url: { url } });
      }
      
      messages.push({ role, content: contentArray });
    } else {
      if (!textContent) {
        textContent = "（無言のメッセージ）";
      }
      messages.push({
        role,
        content: role === 'user' ? `"${displayName}": ${textContent}` : textContent,
      });
    }

    if (systemWebContent) {
      messages.push({
        role: 'system',
        content: systemWebContent
      });
    }
  }
  
  return messages;
}
