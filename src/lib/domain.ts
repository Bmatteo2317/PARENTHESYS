// Dominio Parenthesys: persona, nucleo, relazione, attività, capacità, carico.

export const Permission = {
  ADMIN: "ADMIN",
  HELPER: "HELPER",
  MEMBER: "MEMBER",
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const Category = {
  WORK: "WORK",
  SCHOOL: "SCHOOL",
  SPORT: "SPORT",
  HEALTH: "HEALTH",
  HOUSEHOLD: "HOUSEHOLD",
  LEISURE: "LEISURE",
  CARE: "CARE",
  ERRANDS: "ERRANDS",
  ADMIN: "ADMIN",
  COMMUNITY: "COMMUNITY",
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const EventStatus = {
  CONFIRMED: "CONFIRMED",
  UNASSIGNED: "UNASSIGNED",
  CONFLICT: "CONFLICT",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const TaskStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CONFLICT_WARNING: "CONFLICT_WARNING",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

// Stati completi di un'attività (blueprint): distingue non completata, rifiutata, annullata, impossibile.
export const ActivityStatus = {
  DRAFT: "draft",
  PROPOSED: "proposed",
  UNASSIGNED: "unassigned",
  ASSIGNED: "assigned",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
  NEEDS_REVIEW: "needs_review",
} as const;
export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; tone: string; open: boolean }> = {
  draft: { label: "Bozza", tone: "neutral", open: true },
  proposed: { label: "Proposta", tone: "info", open: true },
  unassigned: { label: "Senza responsabile", tone: "warn", open: true },
  assigned: { label: "Assegnata", tone: "info", open: true },
  accepted: { label: "Accettata", tone: "ok", open: true },
  declined: { label: "Rifiutata", tone: "warn", open: true },
  in_progress: { label: "In corso", tone: "info", open: true },
  blocked: { label: "Bloccata", tone: "danger", open: true },
  completed: { label: "Completata", tone: "ok", open: false },
  skipped: { label: "Saltata", tone: "neutral", open: false },
  cancelled: { label: "Annullata", tone: "neutral", open: false },
  needs_review: { label: "Da rivedere", tone: "warn", open: true },
};

export const RoleKey = {
  OWNER: "owner",
  ADMINISTRATOR: "administrator",
  MEMBER: "member",
  LIMITED_MEMBER: "limited_member",
  CAREGIVER: "caregiver",
  OBSERVER: "observer",
  GUEST: "guest",
  SERVICE_PROVIDER: "service_provider",
} as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const VISIBILITY = {
  PRIVATE: "private",
  HOUSEHOLD: "household",
  ADMIN: "admin",
  DERIVED: "derived",
} as const;
export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const VISIBILITY_META: Record<Visibility, { label: string; help: string }> = {
  private: { label: "Solo per me", help: "Visibile soltanto a te. Il nucleo non vede il dettaglio." },
  household: { label: "Tutto il nucleo", help: "Visibile a chi fa parte del nucleo." },
  admin: { label: "Amministratori", help: "Visibile solo a chi amministra lo spazio." },
  derived: { label: "Solo disponibilità", help: "Il nucleo vede solo l'effetto, non il motivo." },
};

export const Capacity = {
  HIGH: "high",
  NORMAL: "normal",
  REDUCED: "reduced",
  PROTECTED: "protected",
  UNAVAILABLE: "unavailable",
} as const;
export type Capacity = (typeof Capacity)[keyof typeof Capacity];

export const CAPACITY_META: Record<Capacity, { label: string; tone: string; factor: number; behavior: string }> = {
  high: { label: "Alta", tone: "ok", factor: 1, behavior: "Pianificazione normale, può accogliere anche imprevisti." },
  normal: { label: "Normale", tone: "info", factor: 0.85, behavior: "Suggerimenti ordinari." },
  reduced: { label: "Ridotta", tone: "warn", factor: 0.5, behavior: "Ridurre nuove assegnazioni." },
  protected: { label: "Protetta", tone: "warn", factor: 0.25, behavior: "Proporre supporto e rotazione." },
  unavailable: { label: "Non disponibile", tone: "danger", factor: 0, behavior: "Cercare automaticamente alternative." },
};

export const STRESS_SCALE: { level: number; label: string; behavior: string }[] = [
  { level: 0, label: "Sto bene", behavior: "Pianificazione normale" },
  { level: 1, label: "Carico gestibile", behavior: "Suggerimenti ordinari" },
  { level: 2, label: "Sotto pressione", behavior: "Ridurre nuove assegnazioni" },
  { level: 3, label: "In affaticamento", behavior: "Proporre supporto e rotazione" },
  { level: 4, label: "Sovraccarico", behavior: "Evitare attività non necessarie" },
  { level: 5, label: "Non disponibile", behavior: "Cercare automaticamente alternative" },
];

export const Flexibility = {
  FIXED: "fixed",
  SEMI: "semi_flexible",
  FLEXIBLE: "flexible",
} as const;
export type Flexibility = (typeof Flexibility)[keyof typeof Flexibility];

export const FLEXIBILITY_META: Record<Flexibility, { label: string; help: string }> = {
  fixed: { label: "Fisso", help: "Non può essere spostato." },
  semi_flexible: { label: "Poco flessibile", help: "Spostabile solo con preavviso." },
  flexible: { label: "Flessibile", help: "Può essere riorganizzato con facilità." },
};

// Catalogo dei permessi granulari. Il minimo privilegio è applicato qui.
export const PERMISSIONS = [
  "calendar.read",
  "event.create",
  "event.edit_own",
  "event.edit_others",
  "task.assign",
  "workload.read_aggregate",
  "workload.read_detail",
  "invite.manage",
  "settings.manage",
  "data.export",
  "data.delete",
  "integrations.manage",
  "notifications.receive",
  "care.read_sensitive",
  "support.respond",
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number];

export const PERMISSION_META: Record<PermissionKey, { label: string; group: string; sensitive?: boolean }> = {
  "calendar.read": { label: "Leggere il calendario", group: "Calendario" },
  "event.create": { label: "Creare eventi", group: "Calendario" },
  "event.edit_own": { label: "Modificare i propri eventi", group: "Calendario" },
  "event.edit_others": { label: "Modificare gli eventi altrui", group: "Calendario" },
  "task.assign": { label: "Assegnare attività", group: "Attività" },
  "workload.read_aggregate": { label: "Vedere il carico aggregato", group: "Carico" },
  "workload.read_detail": { label: "Vedere il dettaglio del carico altrui", group: "Carico", sensitive: true },
  "invite.manage": { label: "Invitare persone", group: "Nucleo" },
  "settings.manage": { label: "Gestire le impostazioni", group: "Nucleo" },
  "data.export": { label: "Esportare i dati", group: "Dati" },
  "data.delete": { label: "Eliminare i dati", group: "Dati", sensitive: true },
  "integrations.manage": { label: "Gestire le integrazioni", group: "Dati" },
  "notifications.receive": { label: "Ricevere notifiche", group: "Nucleo" },
  "care.read_sensitive": { label: "Vedere dati su minori o persone assistite", group: "Cura", sensitive: true },
  "support.respond": { label: "Rispondere alle richieste di aiuto", group: "Attività" },
};

export const ROLE_META: Record<RoleKey, { label: string; description: string; permission: Permission; scope: "full" | "limited" | "read"; }> = {
  owner: { label: "Referente del nucleo", description: "Amministra lo spazio. Non implica superiorità: è un ruolo tecnico.", permission: Permission.ADMIN, scope: "full" },
  administrator: { label: "Amministrazione", description: "Gestisce persone, permessi e impostazioni.", permission: Permission.ADMIN, scope: "full" },
  member: { label: "Componente", description: "Partecipa con piena capacità al coordinamento.", permission: Permission.HELPER, scope: "full" },
  limited_member: { label: "Componente con accesso limitato", description: "Vede solo ciò che la riguarda.", permission: Permission.MEMBER, scope: "limited" },
  caregiver: { label: "Caregiver", description: "Si prende cura di una persona assistita.", permission: Permission.HELPER, scope: "limited" },
  observer: { label: "Osservatore", description: "Può leggere, non modificare.", permission: Permission.MEMBER, scope: "read" },
  guest: { label: "Ospite", description: "Accesso temporaneo e circoscritto.", permission: Permission.MEMBER, scope: "read" },
  service_provider: { label: "Servizio o professionista", description: "Vede solo le attività assegnate.", permission: Permission.MEMBER, scope: "read" },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  owner: [...PERMISSIONS],
  administrator: PERMISSIONS.filter((key) => key !== "data.delete"),
  member: ["calendar.read", "event.create", "event.edit_own", "task.assign", "workload.read_aggregate", "notifications.receive", "support.respond"],
  limited_member: ["calendar.read", "event.create", "event.edit_own", "workload.read_aggregate", "notifications.receive", "support.respond"],
  caregiver: ["calendar.read", "event.create", "event.edit_own", "task.assign", "workload.read_aggregate", "care.read_sensitive", "support.respond", "notifications.receive"],
  observer: ["calendar.read", "workload.read_aggregate"],
  guest: ["calendar.read"],
  service_provider: ["calendar.read", "support.respond"],
};

export const HOUSEHOLD_TYPES = [
  { value: "custom", label: "Gruppo personalizzato" },
  { value: "shared_home", label: "Casa condivisa" },
  { value: "co_parenting", label: "Co-genitorialità" },
  { value: "extended_family", label: "Famiglia estesa" },
  { value: "care_network", label: "Rete di cura" },
  { value: "assistance", label: "Assistenza" },
] as const;

export const CONSTRAINT_TYPES = [
  { value: "shift_work", label: "Lavoro a turni" },
  { value: "study", label: "Studio" },
  { value: "commute", label: "Pendolarismo" },
  { value: "reduced_mobility", label: "Mobilità ridotta" },
  { value: "cannot_drive", label: "Non può guidare" },
  { value: "other_responsibilities", label: "Responsabilità verso altre persone" },
  { value: "allergy", label: "Allergie o limiti legati alle attività" },
  { value: "needs_company", label: "Necessita di un'altra persona presente" },
  { value: "time_limit", label: "Limiti di tempo" },
  { value: "energy_limit", label: "Limiti di energia" },
  { value: "budget_limit", label: "Limiti economici" },
] as const;

export const PREFERENCE_LEVELS = [
  { value: "prefer", label: "Preferisco farlo" },
  { value: "neutral", label: "Indifferente" },
  { value: "with_support", label: "Posso, ma con supporto" },
  { value: "avoid", label: "Preferisco non farlo" },
] as const;

export type WorkSchedule = { unavailable?: { day: number; start: string; end: string }[] } | null;
