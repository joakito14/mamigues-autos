import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { buildSystemPrompt, setBotStatus } from "./db";

const API_KEY = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "";

if (!API_KEY) {
  console.warn("[gemini] ADVERTENCIA: GOOGLE_API_KEY no está configurada");
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Modelos en orden de preferencia — si uno falla pasa al siguiente automáticamente.
// Configurables con la variable GEMINI_MODELS=modelo1,modelo2,...
const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const MODELS: string[] = (process.env.GEMINI_MODELS ?? DEFAULT_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

console.log(`[gemini] Modelos configurados: ${MODELS.join(" → ")}`);

// Configuración de seguridad permisiva para no bloquear contenido de ventas
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export interface HistoryMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

type GeminiMsg = { role: "user" | "model"; parts: [{ text: string }] };

// Gemini exige: empieza con "user", roles alternados, sin vacíos.
// Esta función limpia el historial para cumplir esas reglas.
function normalizeHistory(history: HistoryMessage[]): GeminiMsg[] {
  // Mapear roles
  const mapped: GeminiMsg[] = history.map((m) => ({
    role: (m.role === "user" ? "user" : "model") as "user" | "model",
    parts: [{ text: m.content }],
  }));

  // Fusionar mensajes consecutivos del mismo rol (concatenar con salto de línea)
  const merged: GeminiMsg[] = [];
  for (const msg of mapped) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].parts[0].text += "\n" + msg.parts[0].text;
    } else {
      merged.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
    }
  }

  // Descartar mensajes "model" del principio hasta encontrar el primer "user"
  while (merged.length > 0 && merged[0].role === "model") {
    merged.shift();
  }

  return merged;
}

async function tryModel(
  modelName: string,
  systemPrompt: string,
  history: HistoryMessage[]
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
  });

  // Normalizar historial para cumplir las reglas de Gemini:
  //   1. Solo roles "user" y "model"
  //   2. Debe empezar con "user"
  //   3. Los roles deben alternar (no dos seguidos del mismo)
  const normalized = normalizeHistory(history);
  if (normalized.length === 0) return "";

  // El último mensaje va como input actual (siempre debe ser "user")
  const lastItem = normalized[normalized.length - 1];
  if (lastItem.role !== "user") return "";

  const geminiHistory = normalized.slice(0, -1);
  const userInput = lastItem.parts[0].text;

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userInput);
  return result.response.text().trim();
}

export async function generateReply(history: HistoryMessage[]): Promise<string> {
  if (history.length === 0) return "";

  const systemPrompt = buildSystemPrompt();
  let lastErr: unknown;

  for (const modelName of MODELS) {
    try {
      setBotStatus("processing", modelName);
      const text = await tryModel(modelName, systemPrompt, history);
      console.log(`[gemini] Respuesta OK con modelo: ${modelName}`);
      setBotStatus("idle");
      return text;
    } catch (err) {
      console.warn(`[gemini] Modelo ${modelName} falló — probando siguiente...`, (err as Error).message?.slice(0, 80));
      lastErr = err;
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message.slice(0, 120) : String(lastErr).slice(0, 120);
  setBotStatus("error", `Todos los modelos fallaron: ${msg}`);
  throw lastErr;
}

export async function extractConversationMetadata(
  history: HistoryMessage[]
): Promise<{ model: string | null; summary: string }> {
  if (history.length === 0) return { model: null, summary: "" };

  const systemPrompt = `Analizá el historial y respondé ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):
{"model":"nombre corto del último vehículo que preguntó el cliente (ej: GLE, Clase C, AMG GT) — null si no preguntó por ninguno","summary":"máximo 2 oraciones sobre qué busca el cliente: necesidad, presupuesto, uso o preferencias mencionadas"}`;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: { maxOutputTokens: 150, temperature: 0 },
      });

      const geminiHistory = history.slice(0, -1).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));
      const lastMsg = history[history.length - 1];
      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(lastMsg?.content ?? "");
      const raw = result.response.text().trim();

      const parsed = JSON.parse(raw);
      return {
        model: typeof parsed.model === "string" && parsed.model !== "null" ? parsed.model : null,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    } catch {
      continue;
    }
  }

  return { model: null, summary: "" };
}
