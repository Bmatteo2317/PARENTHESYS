import { addCalendarDays, dateKey } from "@/lib/format";

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval?: number;
  byWeekday?: number[]; // 0 = lunedì
  count?: number;
  until?: string; // yyyy-MM-dd
};

export function parseRecurrence(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== "object") return null;
  const rule = value as Partial<RecurrenceRule>;
  if (rule.freq !== "daily" && rule.freq !== "weekly" && rule.freq !== "monthly") return null;
  return {
    freq: rule.freq,
    interval: Math.max(1, Number(rule.interval) || 1),
    byWeekday: Array.isArray(rule.byWeekday) ? rule.byWeekday.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : undefined,
    count: rule.count ? Math.max(1, Math.min(60, Number(rule.count))) : undefined,
    until: typeof rule.until === "string" ? rule.until : undefined,
  };
}

// Espande una regola di ricorrenza in date concrete dentro un intervallo.
export function expandRecurrence(rule: RecurrenceRule, start: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = [];
  const interval = rule.interval ?? 1;
  const limit = rule.count ?? 120;
  const until = rule.until ? new Date(`${rule.until}T23:59:59`) : null;
  let cursor = new Date(start);

  while (dates.length < limit && cursor <= rangeEnd) {
    if (until && cursor > until) break;
    if (rule.freq === "daily") {
      dates.push(new Date(cursor));
      cursor = addCalendarDays(cursor, interval);
    } else if (rule.freq === "weekly") {
      const weekdays = rule.byWeekday?.length ? [...rule.byWeekday].sort((a, b) => a - b) : [(cursor.getDay() + 6) % 7];
      const weekStart = addCalendarDays(cursor, -((cursor.getDay() + 6) % 7));
      for (const weekday of weekdays) {
        const day = addCalendarDays(weekStart, weekday);
        if (day >= start && day <= rangeEnd && (!until || day <= until)) dates.push(day);
      }
      cursor = addCalendarDays(weekStart, 7 * interval);
    } else {
      const day = new Date(cursor);
      day.setMonth(day.getMonth() + interval);
      if (day > rangeEnd) break;
      dates.push(new Date(cursor));
      cursor = day;
    }
  }

  return dates.map((date) => new Date(date));
}

export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return "Una tantum";
  const weekdayNames = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  if (rule.freq === "daily") return rule.interval && rule.interval > 1 ? `Ogni ${rule.interval} giorni` : "Ogni giorno";
  if (rule.freq === "weekly") {
    const days = rule.byWeekday?.length ? rule.byWeekday.map((day) => weekdayNames[day]).join(", ") : "ogni settimana";
    return rule.interval && rule.interval > 1 ? `Ogni ${rule.interval} settimane (${days})` : `Ogni settimana (${days})`;
  }
  return rule.interval && rule.interval > 1 ? `Ogni ${rule.interval} mesi` : "Ogni mese";
}

export function occurrenceKey(seriesId: string | null, date: Date): string {
  return `${seriesId ?? "single"}:${dateKey(date)}`;
}
