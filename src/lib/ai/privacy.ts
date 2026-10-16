export type PersonRef = { id: string; name: string };

export type RedactionResult = {
  text: string;
  tokenToPerson: Map<string, PersonRef>;
  redactions: number;
};

// Privacy gateway: prima di inviare una richiesta al provider esterno sostituiamo nomi,
// email, telefoni e indirizzi con identificativi temporanei.
export function redactForProvider(input: string, people: PersonRef[]): RedactionResult {
  let text = input;
  let redactions = 0;
  const tokenToPerson = new Map<string, PersonRef>();

  const ordered = [...people].sort((a, b) => b.name.length - a.name.length);
  ordered.forEach((person, index) => {
    const token = `PERSON_${index + 1}`;
    const variants = new Set<string>([person.name, person.name.split(/\s+/)[0]]);
    let replaced = false;
    for (const variant of variants) {
      if (!variant || variant.length < 2) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi");
      if (pattern.test(text)) {
        text = text.replace(pattern, token);
        replaced = true;
        redactions += 1;
      }
    }
    if (replaced) tokenToPerson.set(token, person);
  });

  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => { redactions += 1; return "[email]"; });
  text = text.replace(/(\+?\d[\d\s().-]{7,}\d)/g, () => { redactions += 1; return "[numero]"; });
  text = text.replace(/\b(?:via|viale|piazza|corso|strada)\s+[A-Za-zÀ-ÿ0-9' .]{3,40}\d*/gi, () => { redactions += 1; return "[indirizzo]"; });

  return { text, tokenToPerson, redactions };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Riporta i token (PERSON_1) ai nomi reali, solo se autorizzati dal nucleo.
export function restorePeople(value: string, tokenToPerson: Map<string, PersonRef>): { id: string | null; name: string | null } {
  const match = /\bPERSON_(\d+)\b/i.exec(value);
  if (!match) return { id: null, name: null };
  const person = tokenToPerson.get(`PERSON_${match[1]}`);
  return person ? { id: person.id, name: person.name } : { id: null, name: null };
}

export function redactObject(value: unknown, people: PersonRef[]): { value: unknown; tokenToPerson: Map<string, PersonRef> } {
  const tokenToPerson = new Map<string, PersonRef>();
  const walk = (input: unknown): unknown => {
    if (typeof input === "string") {
      const result = redactForProvider(input, people);
      for (const [token, person] of result.tokenToPerson) tokenToPerson.set(token, person);
      return result.text;
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, val]) => [key, walk(val)]));
    }
    return input;
  };
  return { value: walk(value), tokenToPerson };
}
