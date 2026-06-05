import OpenAI from "openai";
import { buildSystemPrompt } from "./db";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

export interface HistoryMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

export async function generateReply(
  history: HistoryMessage[]
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(
    (m) => ({
      role: m.role === "human" ? "assistant" : m.role,
      content: m.content,
    })
  );

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...messages,
    ],
    max_tokens: 512,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export async function extractConversationMetadata(
  history: HistoryMessage[]
): Promise<{ model: string | null; summary: string }> {
  if (history.length === 0) return { model: null, summary: "" };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(
    (m) => ({
      role: m.role === "human" ? "assistant" : m.role,
      content: m.content,
    })
  );

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Analizá el historial y respondé ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):
{"model":"nombre corto del último vehículo que preguntó el cliente (ej: GLE, Clase C, AMG GT) — null si no preguntó por ninguno","summary":"máximo 2 oraciones sobre qué busca el cliente: necesidad, presupuesto, uso o preferencias mencionadas"}`,
        },
        ...messages,
      ],
      max_tokens: 150,
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      model: typeof parsed.model === "string" && parsed.model !== "null" ? parsed.model : null,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return { model: null, summary: "" };
  }
}
