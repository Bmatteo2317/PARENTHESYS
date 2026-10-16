import { AiUnavailableError, isAiConfigured, requestJson } from "@/lib/ai/openrouter";
import { PersonRef, redactForProvider, restorePeople } from "@/lib/ai/privacy";
import { ExtractedCareItem, extractionSchema, negotiationSchema, Negotiation, weeklySummarySchema, WeeklySummary } from "@/lib/ai/schemas";

export type AiContext = {
  familyGroupId: string | null;
  userId: string | null;
  locale: string;
  timeZone: string;
  now: Date;
  people: PersonRef[];
  careProfiles: { id: string; name: string }[];
  categories: string[];
};

export type ResolvedItem = ExtractedCareItem & {
  startIso: string | null;
  endIso: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  participantIds: string[];
};

export type ExtractionResult = {
  items: ResolvedItem[];
  explanation: string;
  confidence: number;
  peopleMentioned: string[];
  redactions: number;
};

const EXTRACTION_SYSTEM = `Sei il Care Orchestrator di Parenthesys, un assistente di coordinamento per nuclei familiari.
Trasformi testo naturale (messaggi, fogli scolastici, appunti) in elementi strutturati.
Regole assolute:
- Non assegnare mai un'attività a una persona: proponi sempre una bozza da confermare.
- Non dedurre genere, parentela o ruoli familiari.
- Non inventare dati mancanti: elencali in missing_information.
- Distingui "eventi" (accadono in un intervallo) da "attività" (richiedono un'azione: prenotare, preparare, accompagnare, acquistare, ricordare).
- Rispondi SOLO con JSON valido conforme allo schema indicato.`;

function extractionUserPrompt(input: string, context: AiContext) {
  const people = context.people.map((person, index) => `PERSON_${index + 1}`).join(", ") || "nessuno";
  return `Contesto:
- Oggi è ${context.now.toISOString()} (fuso ${context.timeZone}, lingua ${context.locale}).
- Persone del nucleo (riferisciti a loro solo con i token): ${people}.
- Persone assistite: ${context.careProfiles.map((profile) => profile.name).join(", ") || "nessuna"}.
- Categorie ammesse: ${context.categories.join(", ")}.

Schema JSON richiesto:
{
  "intent": "extract_care_items",
  "confidence": 0.0-1.0,
  "needs_confirmation": true,
  "people_mentioned": ["PERSON_1"],
  "items": [{
    "kind": "event" | "task",
    "title": string,
    "category": una delle categorie ammesse,
    "start": ISO8601 con fuso oppure null,
    "end": ISO8601 con fuso oppure null,
    "estimated_minutes": intero o null,
    "preparation_minutes": intero o null,
    "travel_minutes": intero o null,
    "participants": [token o nome],
    "assignee": token oppure null,
    "requires_booking": boolean,
    "location": string o null,
    "notes": string o null,
    "missing_information": [string],
    "confidence": 0.0-1.0
  }],
  "explanation": string
}

Testo da analizzare:
"""${input}"""`;
}

// Estrarre non significa scrivere: il risultato è sempre una bozza da confermare.
export async function extractCareItems(input: string, context: AiContext): Promise<ExtractionResult> {
  const redacted = redactForProvider(input, context.people);
  const raw = await requestJson({
    operation: "extract",
    system: EXTRACTION_SYSTEM,
    user: extractionUserPrompt(redacted.text, context),
    sessionRef: { familyGroupId: context.familyGroupId, userId: context.userId },
  });

  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiUnavailableError("schema_mismatch", "La risposta dell'AI non rispetta lo schema richiesto. Nessun dato è stato creato.");
  }

  return {
    items: parsed.data.items.map((item) => resolveItem(item, redacted.tokenToPerson, context)),
    explanation: parsed.data.explanation,
    confidence: parsed.data.confidence,
    peopleMentioned: parsed.data.people_mentioned,
    redactions: redacted.redactions,
  };
}

function resolveItem(item: ExtractedCareItem, tokenToPerson: Map<string, PersonRef>, context: AiContext): ResolvedItem {
  const assignee = item.assignee ? restorePeople(item.assignee, tokenToPerson) : { id: null, name: null };
  const authorizedIds = new Set(context.people.map((person) => person.id));
  const participantIds: string[] = [];
  for (const participant of item.participants) {
    const person = restorePeople(participant, tokenToPerson);
    if (person.id && authorizedIds.has(person.id)) participantIds.push(person.id);
  }
  const assigneeId = assignee.id && authorizedIds.has(assignee.id) ? assignee.id : null;

  return {
    ...item,
    startIso: item.start ? new Date(item.start).toISOString() : null,
    endIso: item.end ? new Date(item.end).toISOString() : null,
    assigneeId,
    assigneeName: assigneeId ? assignee.name : null,
    participantIds: [...new Set(participantIds)],
  };
}

export type WeeklySummaryResult = { summary: WeeklySummary; redactions: number };

const SUMMARY_SYSTEM = `Sei il Care Orchestrator di Parenthesys. Riassumi la settimana di un nucleo in modo neutro e non giudicante.
Non produrre classifiche, punteggi morali o giudizi sulle persone. Evidenzia il lavoro invisibile e proponi passi concreti.
Rispondi SOLO con JSON valido conforme allo schema.`;

export async function summariseWeek(loadSummary: string, context: AiContext): Promise<WeeklySummaryResult> {
  const redacted = redactForProvider(loadSummary, context.people);
  const raw = await requestJson({
    operation: "summary",
    system: SUMMARY_SYSTEM,
    user: `Dati aggregati della settimana (senza giudizi):
${redacted.text}

Schema JSON richiesto:
{"intent":"weekly_summary","headline":string,"highlights":[string],"imbalances":[string],"invisible_work":[string],"suggestions":[string],"confidence":0.0-1.0}`,
    sessionRef: { familyGroupId: context.familyGroupId, userId: context.userId },
  });

  const parsed = weeklySummarySchema.safeParse(raw);
  if (!parsed.success) throw new AiUnavailableError("schema_mismatch", "Il riassunto non ha la forma attesa.");
  return { summary: parsed.data, redactions: redacted.redactions };
}

const NEGOTIATION_SYSTEM = `Sei il Care Orchestrator di Parenthesys. Quando nasce un nuovo impegno, proponi opzioni collaborative.
Non scrivere a una persona contro la sua volontà, non usare persuasione emotiva, non decidere al posto del nucleo.
Rispondi SOLO con JSON valido conforme allo schema.`;

export async function negotiateAssignment(situation: string, context: AiContext): Promise<Negotiation> {
  const redacted = redactForProvider(situation, context.people);
  const raw = await requestJson({
    operation: "negotiate",
    system: NEGOTIATION_SYSTEM,
    user: `Situazione:
${redacted.text}

Schema JSON richiesto:
{"intent":"negotiate","framing":string,"options":[{"label":string,"kind":"assign|rotate|support|move|split|reduce|confirm","rationale":string,"tradeoff":string}],"confidence":0.0-1.0}`,
    temperature: 0.4,
    sessionRef: { familyGroupId: context.familyGroupId, userId: context.userId },
  });

  const parsed = negotiationSchema.safeParse(raw);
  if (!parsed.success) throw new AiUnavailableError("schema_mismatch", "La proposta non ha la forma attesa.");
  return parsed.data;
}

export { isAiConfigured, AiUnavailableError };
