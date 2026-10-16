import { ActivityStatus, Capacity, CAPACITY_META, Category, Flexibility, RoleKey } from "@/lib/domain";
import { CATEGORY_META, LoadDimensionKey } from "@/lib/categories";

// Un item di carico è la rappresentazione normalizzata di un evento o di un'attività.
export type LoadItem = {
  id: string;
  kind: "event" | "task";
  title: string;
  category: Category;
  primaryAssigneeId: string | null;
  supportAssigneeIds: string[];
  participants: string[];
  start: Date | null;
  end: Date | null;
  estimatedMinutes: number;
  preparationMinutes: number;
  travelMinutes: number;
  coordinationMinutes: number;
  onCallMinutes: number;
  mentalLoad: number;
  physicalLoad: number;
  emotionalLoad: number;
  urgency: number;
  predictability: number;
  flexibility: Flexibility;
  rotates: boolean;
  open: boolean;
};

export type MemberLoadInput = {
  userId: string;
  name: string;
  color: string;
  roleKey: RoleKey;
  capacity: Capacity;
};

export type MemberLoad = {
  userId: string;
  name: string;
  color: string;
  roleKey: RoleKey;
  capacity: Capacity;
  minutes: Record<LoadDimensionKey, number>;
  totalMinutes: number;
  activityCount: number;
  openCount: number;
  unassignedCount: number;
  mentalLoadScore: number;
  physicalLoadScore: number;
  emotionalLoadScore: number;
  urgencyScore: number;
  fixedMinutes: number;
  flexibleMinutes: number;
  share: number;
};

export type WorkloadSignal = {
  id: string;
  tone: "info" | "warn" | "danger";
  title: string;
  detail: string;
};

export type WorkloadReport = {
  members: MemberLoad[];
  totalMinutes: number;
  concentration: number;
  signals: WorkloadSignal[];
  unassignedCount: number;
  coordinationMinutes: number;
  onCallMinutes: number;
};

function categoryDimension(category: Category): LoadDimensionKey {
  switch (category) {
    case "HOUSEHOLD":
    case "ERRANDS":
      return "householdMinutes";
    case "CARE":
    case "HEALTH":
      return "careMinutes";
    case "ADMIN":
    case "WORK":
      return "coordinationMinutes";
    default:
      return "operationalMinutes";
  }
}

// Trasforma un item nel contributo di carico per ciascuna dimensione.
export function itemMinutes(item: LoadItem): Record<LoadDimensionKey, number> {
  const base = item.estimatedMinutes || 0;
  const prep = item.preparationMinutes || 0;
  const travel = item.travelMinutes || 0;
  const coordination = item.coordinationMinutes || 0;
  const dimension = categoryDimension(item.category);
  return {
    operationalMinutes: dimension === "operationalMinutes" ? base : 0,
    careMinutes: dimension === "careMinutes" ? base + prep : travel,
    householdMinutes: dimension === "householdMinutes" ? base + prep : 0,
    coordinationMinutes: coordination || (dimension === "coordinationMinutes" ? base : 0),
    onCallMinutes: item.onCallMinutes || 0,
  };
}

export function emptyMinutes(): Record<LoadDimensionKey, number> {
  return { operationalMinutes: 0, careMinutes: 0, householdMinutes: 0, coordinationMinutes: 0, onCallMinutes: 0 };
}

export function computeWorkload(members: MemberLoadInput[], items: LoadItem[]): WorkloadReport {
  const byUser = new Map<string, MemberLoad>();
  for (const member of members) {
    byUser.set(member.userId, {
      userId: member.userId,
      name: member.name,
      color: member.color,
      roleKey: member.roleKey,
      capacity: member.capacity,
      minutes: emptyMinutes(),
      totalMinutes: 0,
      activityCount: 0,
      openCount: 0,
      unassignedCount: 0,
      mentalLoadScore: 0,
      physicalLoadScore: 0,
      emotionalLoadScore: 0,
      urgencyScore: 0,
      fixedMinutes: 0,
      flexibleMinutes: 0,
      share: 0,
    });
  }

  let unassignedCount = 0;
  for (const item of items) {
    if (!item.primaryAssigneeId) {
      unassignedCount += 1;
      continue;
    }
    const member = byUser.get(item.primaryAssigneeId);
    if (!member) continue;
    const minutes = itemMinutes(item);
    const duration = Object.values(minutes).reduce((sum, value) => sum + value, 0);
    const dimensionKeys = Object.keys(minutes) as LoadDimensionKey[];
    for (const key of dimensionKeys) member.minutes[key] += minutes[key];
    member.totalMinutes += duration;
    member.activityCount += 1;
    if (item.open) member.openCount += 1;
    member.mentalLoadScore += item.mentalLoad * (item.open ? 1.4 : 1);
    member.physicalLoadScore += item.physicalLoad;
    member.emotionalLoadScore += item.emotionalLoad;
    member.urgencyScore += item.urgency * (item.open ? 1.3 : 1);
    if (item.flexibility === Flexibility.FIXED) member.fixedMinutes += duration;
    else member.flexibleMinutes += duration;
  }

  const totalMinutes = [...byUser.values()].reduce((sum, member) => sum + member.totalMinutes, 0);
  for (const member of byUser.values()) {
    member.share = totalMinutes > 0 ? member.totalMinutes / totalMinutes : 0;
  }

  const list = [...byUser.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);

  return {
    members: list,
    totalMinutes,
    concentration: gini(list.map((member) => member.totalMinutes)),
    coordinationMinutes: list.reduce((sum, member) => sum + member.minutes.coordinationMinutes, 0),
    onCallMinutes: list.reduce((sum, member) => sum + member.minutes.onCallMinutes, 0),
    unassignedCount,
    signals: buildSignals(list, items, unassignedCount),
  };
}

// Indice di concentrazione (0 = perfettamente distribuito, 1 = tutto su una persona).
export function gini(values: number[]): number {
  const positive = values.filter((value) => value > 0);
  if (positive.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  const count = sorted.length;
  let cumulative = 0;
  for (let index = 0; index < count; index += 1) cumulative += (index + 1) * sorted[index];
  return Math.min(1, Math.max(0, (2 * cumulative) / (count * total) - (count + 1) / count));
}

function buildSignals(members: MemberLoad[], items: LoadItem[], unassignedCount: number): WorkloadSignal[] {
  const signals: WorkloadSignal[] = [];
  const loaded = members.filter((member) => member.totalMinutes > 0);
  const average = loaded.length ? loaded.reduce((sum, member) => sum + member.totalMinutes, 0) / loaded.length : 0;

  for (const member of members) {
    if (member.capacity === Capacity.UNAVAILABLE) {
      signals.push({ id: `cap-${member.userId}`, tone: "danger", title: `${member.name} non è disponibile`, detail: "Il sistema cerca automaticamente alternative invece di assegnare nuove attività." });
    } else if (member.capacity === Capacity.PROTECTED || member.capacity === Capacity.REDUCED) {
      signals.push({ id: `cap-${member.userId}`, tone: "warn", title: `${member.name} ha capacità ${CAPACITY_META[member.capacity].label.toLowerCase()}`, detail: CAPACITY_META[member.capacity].behavior });
    }
    if (average > 0 && member.totalMinutes > average * 1.35 && loaded.length > 1) {
      signals.push({ id: `over-${member.userId}`, tone: "warn", title: `${member.name} porta più carico della media`, detail: `Circa ${Math.round(member.totalMinutes / 60 * 10) / 10}h contro una media di ${Math.round(average / 60 * 10) / 10}h. Non è una classifica: è un segnale per parlarne.` });
    }
  }

  if (unassignedCount > 0) {
    signals.push({ id: "unassigned", tone: "warn", title: `${unassignedCount} ${unassignedCount === 1 ? "attività senza responsabile" : "attività senza responsabile"}`, detail: "Nessuno se ne sta occupando. Puoi proporre una rotazione o chiedere supporto." });
  }

  const recurring = items.filter((item) => item.rotates && item.primaryAssigneeId);
  if (recurring.length >= 3) {
    const counts = new Map<string, number>();
    for (const item of recurring) counts.set(item.primaryAssigneeId as string, (counts.get(item.primaryAssigneeId as string) ?? 0) + 1);
    const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const topMember = members.find((member) => member.userId === topId);
    if (topMember && topCount >= Math.ceil(recurring.length * 0.6)) {
      signals.push({ id: "rotation", tone: "info", title: "Le attività ricorrenti si concentrano su una persona", detail: `${topMember.name} copre ${topCount} attività ricorrenti su ${recurring.length}. Una rotazione esplicita può riequilibrare senza giudicare.` });
    }
  }

  return signals;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function isOpenStatus(status: ActivityStatus): boolean {
  return status !== ActivityStatus.COMPLETED && status !== ActivityStatus.CANCELLED && status !== ActivityStatus.SKIPPED;
}

export function itemTone(category: Category): string {
  return CATEGORY_META[category]?.color ?? "#7c6bd6";
}
