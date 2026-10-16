import { Category } from "@/lib/domain";

export type CategoryMeta = {
  label: string;
  color: string;
  soft: string;
  icon: string;
  group: "operativo" | "cura" | "casa" | "coordinamento";
};

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  WORK: { label: "Lavoro", color: "#7c6bd6", soft: "#f1eefb", icon: "▣", group: "operativo" },
  SCHOOL: { label: "Scuola", color: "#5b7fd4", soft: "#ecf1fc", icon: "✎", group: "operativo" },
  SPORT: { label: "Sport", color: "#4fa38c", soft: "#e8f5f0", icon: "↗", group: "operativo" },
  HEALTH: { label: "Salute", color: "#d4676b", soft: "#fbeced", icon: "✚", group: "cura" },
  HOUSEHOLD: { label: "Casa", color: "#c58b45", soft: "#fbf1e4", icon: "⌂", group: "casa" },
  LEISURE: { label: "Svago", color: "#cf6f9c", soft: "#fbeaf1", icon: "✳", group: "operativo" },
  CARE: { label: "Cura", color: "#e08a3c", soft: "#fdf0e2", icon: "♥", group: "cura" },
  ERRANDS: { label: "Commissioni", color: "#8a7fc4", soft: "#f0eefb", icon: "⇄", group: "casa" },
  ADMIN: { label: "Documenti", color: "#6d7b8d", soft: "#eef1f5", icon: "▦", group: "coordinamento" },
  COMMUNITY: { label: "Comunità", color: "#59a56f", soft: "#eaf6ec", icon: "◍", group: "coordinamento" },
};

export const CATEGORY_OPTIONS = (Object.entries(CATEGORY_META) as [Category, CategoryMeta][]).map(([value, meta]) => ({
  value,
  ...meta,
}));

// Le attività si dividono in tempo operativo, cura, lavoro domestico e coordinamento mentale.
export const LOAD_DIMENSIONS = [
  { key: "operationalMinutes", label: "Tempo operativo", color: "#7c6bd6", help: "Il tempo effettivamente speso a svolgere l'attività." },
  { key: "careMinutes", label: "Attività di cura", color: "#e08a3c", help: "Accompagnare, assistere, prendersi cura di qualcuno." },
  { key: "householdMinutes", label: "Lavoro domestico", color: "#c58b45", help: "Cucinare, pulire, spesa, lavatrici e riordino." },
  { key: "coordinationMinutes", label: "Coordinamento", color: "#5b7fd4", help: "Prenotare, ricordare, controllare, verificare." },
  { key: "onCallMinutes", label: "Reperibilità", color: "#cf6f9c", help: "Restare disponibili in caso di imprevisti." },
] as const;

export type LoadDimensionKey = (typeof LOAD_DIMENSIONS)[number]["key"];
