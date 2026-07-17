import OpenAI from "openai";
import * as Discord from 'discord.js';
import { logger } from './logger';

// 環境変数から設定を取得 (デフォルトはOpenRouter)
const apiKey = process.env.LLM_API_KEY || "";
const baseURL = process.env.LLM_API_BASEURL || "https://openrouter.ai/api/v1";
const modelName = process.env.LLM_API_MODEL || "";

const LLM_SYSTEM_PROMPT = process.env.LLM_SYSTEM_PROMPT || "あなたはDiscordで動作する便利なBotです。ユーザーからの質問や会話に自然な日本語で返答してください。";


const openai = new OpenAI({
  baseURL,
  apiKey,
});


export const generateLLMResponse = async (
  chatMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  discordMsg?: Discord.Message
): Promise<string> => {
  if (!apiKey) {
    return "エラー: LLM_API_KEY が環境変数に設定されていません。";
  }

  const id = discordMsg?.id || Math.random().toString(36).substring(2, 15); // ランダムなIDを生成

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: LLM_SYSTEM_PROMPT }, 
    ...chatMessages
  ];

  try {
    const request = {
      model: modelName,
      messages: messages,
      // seed: Math.floor(Math.random() * 1000000) // modelによってseed指定非対応
    };

    logger.log("LLM API Request (" + id + "):\n", {
      discordMsg: discordMsg?.url,
      model: modelName,
      requested: new Date(),
    })

    const response = await openai.chat.completions.create(request);

    logger.log("LLM API Response (" + id + "):\n", {
      responceId: response.id,
      model: response.model,
      responced: new Date(),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      }
    });
    
    const message = response.choices?.[0]?.message;
 
    return message?.content?.trim() ? message.content : "（返答を生成できませんでした）";
  } catch (error) {
    logger.error("LLM API error at:\n", 
      {
        discordMsg: discordMsg?.url,
        model: modelName,
        requested: discordMsg?.createdAt,
      }, 
      "Error:", error
    );
    return "申し訳ありません、LLM APIとの通信中にエラーが発生しました。";
  }
};
