import { API_VERSION, guard, json } from "@/lib/api";

export const dynamic = "force-dynamic";

// Catalogo leggibile delle API versionate: rende l'interfaccia scopribile senza documentazione separata.
const endpoints = [
  { method: "GET", path: "/api/v1/me", description: "Profilo della persona autenticata e i suoi nuclei." },
  { method: "PATCH", path: "/api/v1/me/preferences", description: "Preferenze di notifica (canali, silenzio, riepiloghi)." },
  { method: "POST", path: "/api/v1/me/check-ins", description: "Check-in volontario di capacità e stress." },
  { method: "POST", path: "/api/v1/households", description: "Crea un nuovo nucleo." },
  { method: "GET", path: "/api/v1/households/:id", description: "Dettaglio del nucleo, persone e profili assistiti." },
  { method: "POST", path: "/api/v1/households/:id/invitations", description: "Crea un invito con ruolo e permessi dichiarati." },
  { method: "POST", path: "/api/v1/invitations/:token/accept", description: "Accetta un invito ed entra nel nucleo." },
  { method: "GET", path: "/api/v1/households/:id/calendar", description: "Eventi del nucleo in un intervallo di date." },
  { method: "POST", path: "/api/v1/households/:id/events", description: "Crea un evento condiviso." },
  { method: "POST", path: "/api/v1/households/:id/tasks", description: "Crea un'attività con carico dichiarato." },
  { method: "GET", path: "/api/v1/households/:id/workload", description: "Carico settimanale multi-dimensionale per persona." },
  { method: "GET", path: "/api/v1/households/:id/impact-preview", description: "Simulazione dell'impatto di un'assegnazione." },
  { method: "POST", path: "/api/v1/tasks/:id/assignments", description: "Assegna o riassegna un'attività." },
  { method: "POST", path: "/api/v1/tasks/:id/accept", description: "Accetta un'attività proposta." },
  { method: "POST", path: "/api/v1/tasks/:id/decline", description: "Declina un'attività con una nota." },
  { method: "POST", path: "/api/v1/tasks/:id/support-requests", description: "Apri una richiesta di aiuto su un'attività." },
  { method: "POST", path: "/api/v1/exports", description: "Esporta i propri dati o quelli del nucleo." },
  { method: "POST", path: "/api/v1/deletion-requests", description: "Richiedi la cancellazione, tracciata e con esito." },
];

export async function GET() {
  return guard(async () =>
    json({
      version: API_VERSION,
      authentication: "Sessione Auth.js via cookie. Ogni richiesta è isolata per nucleo.",
      isolation: "Si accede solo ai nuclei di cui si è membri attivi; in caso contrario la risposta è 404.",
      idempotency: "Invia l'intestazione Idempotency-Key sulle POST ripetibili: la ripetizione restituisce la prima risposta.",
      errors: { shape: { error: { code: "string", message: "string", details: "opzionale" } } },
      endpoints,
    }),
  );
}
