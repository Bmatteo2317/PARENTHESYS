import { Category } from "@/lib/domain";

export const CATEGORY_META: Record<Category, { label: string; color: string; soft: string; icon: string }> = {
  WORK: { label: "Lavoro", color: "#8b78bd", soft: "#f0eafb", icon: "▣" },
  SCHOOL: { label: "Scuola", color: "#6d82cb", soft: "#edf0fb", icon: "✎" },
  SPORT: { label: "Sport", color: "#62a38a", soft: "#e9f4ef", icon: "↗" },
  HEALTH: { label: "Salute", color: "#d77c7c", soft: "#faeded", icon: "＋" },
  HOUSEHOLD: { label: "Casa", color: "#c89554", soft: "#fbf0e3", icon: "⌂" },
  LEISURE: { label: "Svago", color: "#cf7d9c", soft: "#f8eaf0", icon: "✳" },
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as Category,
  ...meta,
}));
