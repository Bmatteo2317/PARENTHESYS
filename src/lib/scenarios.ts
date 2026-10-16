import { CAPACITY_META, Category } from "@/lib/domain";
import { computeWorkload, LoadItem, MemberLoadInput, WorkloadReport, formatMinutes } from "@/lib/workload";
import { gini } from "@/lib/workload";

export type ScenarioMutation =
  | { type: "rotate"; itemId?: string; fromUserId?: string; toUserId: string; label: string }
  | { type: "move"; itemId: string; label: string }
  | { type: "reduce"; itemId: string; minutesRemoved: number; label: string }
  | { type: "external_support"; minutes: number; label: string; targetUserId: string }
  | { type: "drop"; itemId: string; label: string }
  | { type: "protect"; userId: string; label: string };

export type ScenarioMetrics = {
  totalMinutes: number;
  coordinationMinutes: number;
  mentalLoadScore: number;
  estimatedStress: "basso" | "medio" | "alto";
  renunciations: number;
  uncoveredCount: number;
  concentration: number;
  spreadMinutes: number;
};

export type ScenarioVariantResult = {
  label: string;
  kind: string;
  mutations: ScenarioMutation[];
  metrics: ScenarioMetrics;
  perMember: { userId: string; name: string; color: string; minutes: number }[];
  summary: string;
};

function applyMutations(items: LoadItem[], mutations: ScenarioMutation[]): { items: LoadItem[]; renunciations: number; externalMinutes: number } {
  let working = items.map((item) => ({ ...item }));
  let renunciations = 0;
  let externalMinutes = 0;

  for (const mutation of mutations) {
    if (mutation.type === "rotate") {
      if (mutation.itemId) {
        working = working.map((item) => item.id === mutation.itemId ? { ...item, primaryAssigneeId: mutation.toUserId } : item);
      } else if (mutation.fromUserId) {
        working = working.map((item) => item.primaryAssigneeId === mutation.fromUserId ? { ...item, primaryAssigneeId: mutation.toUserId } : item);
      }
    } else if (mutation.type === "move") {
      renunciations += 1;
    } else if (mutation.type === "reduce") {
      working = working.map((item) => item.id === mutation.itemId ? { ...item, estimatedMinutes: Math.max(0, item.estimatedMinutes - mutation.minutesRemoved), preparationMinutes: Math.max(0, item.preparationMinutes - Math.round(mutation.minutesRemoved / 3)) } : item);
    } else if (mutation.type === "external_support") {
      externalMinutes += mutation.minutes;
    } else if (mutation.type === "drop") {
      working = working.filter((item) => item.id !== mutation.itemId);
      renunciations += 1;
    } else if (mutation.type === "protect") {
      working = working.map((item) => item.primaryAssigneeId === mutation.userId ? { ...item, primaryAssigneeId: null } : item);
    }
  }

  return { items: working, renunciations, externalMinutes };
}

function metricsFor(report: WorkloadReport, renunciations: number, externalMinutes: number): ScenarioMetrics {
  const mentalLoad = report.members.reduce((sum, member) => sum + member.mentalLoadScore, 0);
  const minutes = report.totalMinutes + externalMinutes;
  const stressScore = report.members.reduce((sum, member) => sum + (member.totalMinutes * (1 - CAPACITY_META[member.capacity].factor)), 0) / Math.max(1, report.members.length);
  const estimatedStress = stressScore > 400 ? "alto" : stressScore > 150 ? "medio" : "basso";
  return {
    totalMinutes: minutes,
    coordinationMinutes: report.coordinationMinutes,
    mentalLoadScore: Math.round(mentalLoad),
    estimatedStress,
    renunciations,
    uncoveredCount: report.unassignedCount,
    concentration: Math.round(report.concentration * 100),
    spreadMinutes: Math.round((Math.max(0, ...report.members.map((member) => member.totalMinutes)) - Math.min(...report.members.map((member) => member.totalMinutes)))),
  };
}

export function buildScenarioVariants(items: LoadItem[], members: MemberLoadInput[]): ScenarioVariantResult[] {
  const base = computeWorkload(members, items);
  const most = base.members[0];
  const least = base.members[base.members.length - 1];
  const heaviestItem = [...items].filter((item) => item.rotates && item.primaryAssigneeId).sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)[0];
  const flexibleItem = items.find((item) => item.flexibility === "flexible" && item.primaryAssigneeId);
  const unassignedItem = items.find((item) => !item.primaryAssigneeId);

  const variants: { label: string; kind: string; mutations: ScenarioMutation[] }[] = [
    { label: "A · Situazione attuale", kind: "current", mutations: [] },
  ];

  if (most && least && most.userId !== least.userId && heaviestItem) {
    variants.push({
      label: "B · Rotazione interna",
      kind: "rotate",
      mutations: [{ type: "rotate", itemId: heaviestItem.id, toUserId: least.userId, label: `Passa "${heaviestItem.title}" a ${least.name}` }],
    });
  }

  if (flexibleItem) {
    variants.push({
      label: "C · Riduzione e spostamento",
      kind: "reduce",
      mutations: [{ type: "reduce", itemId: flexibleItem.id, minutesRemoved: 30, label: `Semplifica "${flexibleItem.title}"` }, { type: "move", itemId: flexibleItem.id, label: "Sposta l'orario in una fascia più libera" }],
    });
  }

  if (most) {
    variants.push({
      label: "D · Supporto esterno",
      kind: "support",
      mutations: [{ type: "external_support", minutes: 120, targetUserId: most.userId, label: "Coinvolgi una risorsa esterna su una parte del lavoro" }],
    });
  }

  if (unassignedItem) {
    variants.push({
      label: "E · Proteggi una persona",
      kind: "protect",
      mutations: [{ type: "protect", userId: most?.userId ?? "", label: "Metti in sicurezza chi ha capacità ridotta" }],
    });
  }

  return variants.map((variant) => {
    const { items: mutatedItems, renunciations, externalMinutes } = applyMutations(items, variant.mutations);
    const report = computeWorkload(members, mutatedItems);
    const metrics = metricsFor(report, renunciations, externalMinutes);
    const perMember = report.members.map((member) => ({ userId: member.userId, name: member.name, color: member.color, minutes: member.totalMinutes }));
    const summary = variant.kind === "current"
      ? `La distribuzione attuale concentra il carico su ${base.members[0]?.name ?? "una persona"} (${Math.round((base.members[0]?.share ?? 0) * 100)}%).`
      : `${variant.mutations.map((mutation) => mutation.label).join(". ")}. Carico totale ${formatMinutes(metrics.totalMinutes)}, concentrazione ${metrics.concentration}%.`;
    return { label: variant.label, kind: variant.kind, mutations: variant.mutations, metrics, perMember, summary };
  });
}

export function scenarioSpread(variant: ScenarioVariantResult): number {
  return gini(variant.perMember.map((member) => member.minutes));
}

export function categoryLabel(category: Category): string {
  return category;
}
