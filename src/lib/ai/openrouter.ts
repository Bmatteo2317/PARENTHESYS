import { db } from "@/lib/db";

export type AiOperation = "extract" | "summary" | "simulate" | "negotiate";

// Il modello è una dipendenza sostituibile, non il cuore incontrollabile del prodotto.
const MODEL_BY_OPERATION: Record<AiOperation, () => string> = {
  extract: () => process.env.OPENROUTER_MODEL_FAST ?? "openai/gpt-4o-mini",
  summary: () => process.env.OPENROUTER_MODEL_ECONOMY ?? "google/gemini-flash-1.5",
  simulate: () => process.env.OPENROUTER_MODEL_REASONING ?? "anthropic/claude-3.5-sonnet",
  negotiate: () => process.env.OPENROUTER_MODEL_REASONING ?? "anthropic/claude-3.5-sonnet",
};

export class AiUnavailableError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.code = code;
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

type ChatOptions = {
  operation: AiOperation;
  system: string;
  user: string;
  temperature?: number;
  sessionRef?: { familyGroupId: string | null; userId: string | null };
};

// La chiave vive solo lato server. Il client non vede mai OPENROUTER_API_KEY né il payload completo in chiaro.
export async function requestJson(options: ChatOptions): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError("missing_key", "Il Care Orchestrator non è configurato: manca la chiave OpenRouter sul server.");
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const model = MODEL_BY_OPERATION[options.operation]();
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "https://parenthesys.app",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Parenthesys",
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    await logAi(options, model, false, Date.now() - startedAt, options.user.length, "network");
    throw new AiUnavailableError("network", error instanceof Error ? error.message : "Rete non disponibile.");
  }

  if (!response.ok) {
    await logAi(options, model, false, Date.now() - startedAt, options.user.length, `http_${response.status}`);
    throw new AiUnavailableError(`http_${response.status}`, "Il servizio AI non ha risposto correttamente.");
  }

  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    await logAi(options, model, false, Date.now() - startedAt, options.user.length, "empty");
    throw new AiUnavailableError("empty", "Il servizio AI ha restituito una risposta vuota.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    await logAi(options, model, false, Date.now() - startedAt, options.user.length, "invalid_json");
    throw new AiUnavailableError("invalid_json", "La risposta dell'AI non è un JSON valido. Nessun risultato inventato viene mostrato.");
  }

  await logAi(options, model, true, Date.now() - startedAt, options.user.length, null);
  return parsed;
}

// Registriamo solo metadati tecnici non sensibili: mai il testo dell'utente, mai dati personali.
async function logAi(options: ChatOptions, model: string, ok: boolean, latencyMs: number, promptChars: number, errorCode: string | null) {
  try {
    await db`
      INSERT INTO "AiLog" ("id", "familyGroupId", "userId", "operation", "model", "ok", "latencyMs", "promptChars", "errorCode")
      VALUES (gen_random_uuid()::text, ${options.sessionRef?.familyGroupId ?? null}, ${options.sessionRef?.userId ?? null},
        ${options.operation}, ${model}, ${ok}, ${latencyMs}, ${promptChars}, ${errorCode})
    `;
  } catch {
    // Il logging non deve mai bloccare il flusso principale.
  }
}
