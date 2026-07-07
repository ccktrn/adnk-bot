import OpenAI from "openai";

// 環境変数から設定を取得 (デフォルトはOpenRouter)
const apiKey = process.env.LLM_API_KEY || "";
const baseURL = process.env.LLM_API_BASEURL || "https://openrouter.ai/api/v1";
const modelName = process.env.LLM_API_MODEL || "";

const LLM_SYSTEM_PROMPT = process.env.LLM_SYSTEM_PROMPT || "あなたはDiscordで動作する便利なBotです。ユーザーからの質問や会話に自然な日本語で返答してください。";


const openai = new OpenAI({
  baseURL,
  apiKey,
});


export const generateLLMResponse = async (chatMessages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<string> => {
  if (!apiKey) {
    return "エラー: LLM_API_KEY が環境変数に設定されていません。";
  }

  

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: LLM_SYSTEM_PROMPT }, 
    ...chatMessages
  ];
  let accumulatedContent = "";

  try {
    const seed = Math.floor(Math.random() * 1000000);
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      seed,
    });

    console.log("LLM API response:", {
      id: response.id,
      model: response.model,
      created: response.created,
      seed,
    });
    
    const message = response.choices[0]?.message;
 
    return message?.content?.trim() ? message.content : "（返答を生成できませんでした）";
  } catch (error) {
    console.error("LLM API error:", error);
    return "申し訳ありません、LLM APIとの通信中にエラーが発生しました。";
  }
};
