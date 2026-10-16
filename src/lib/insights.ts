import { db } from "@/lib/db";
import {
  ActivityStatus,
  Capacity,
  Category,
  Flexibility,
  Permission,
  RoleKey,
} from "@/lib/domain";
import { computeWorkload, LoadItem, MemberLoadInput, WorkloadReport, isOpenStatus } from "@/lib/workload";
import { AssignmentRequest, CandidateProfile, analyseAssignment, AssignmentAnalysis, PreferenceLevel } from "@/lib/equity";
import { ScenarioVariantResult, buildScenarioVariants } from "@/lib/scenarios";
import { CATEGORY_META } from "@/lib/categories";

export type Period = { start: Date; end: Date };

export function weekRange(reference: Date = new Date()): Period {
  const start = new Date(reference);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function dayRange(reference: Date = new Date()): Period {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export type NucleusMember = {
  membershipId: string;
  userId: string;
  name: string;
  displayName: string | null;
  email: string;
  roleKey: RoleKey;
  roleName: string;
  permission: Permission;
  color: string;
  capacity: Capacity;
  capacityFromCheckIn: boolean;
  stress: number | null;
  shareLevel: string;
  kidProfileId: string | null;
  joinedAt: Date;
};

// Il livello di capacity è l'ultimo check-in volontario; se non esiste resta "normal".
export async function loadMembers(familyId: string): Promise<NucleusMember[]> {
  const rows = await db`
    SELECT fm."id" AS "membershipId", fm."userId", fm."roleKey", fm."roleName", fm."permission", fm."color",
      fm."kidProfileId", fm."joinedAt",
      COALESCE(NULLIF(fm."displayName", ''), u."name") AS "name", u."name" AS "accountName",
      u."email", u."avatarColor", u."displayName" AS "userDisplayName",
      ci."capacity", ci."stress", ci."shareLevel"
    FROM "FamilyMember" fm
    JOIN "User" u ON u."id" = fm."userId"
    LEFT JOIN LATERAL (
      SELECT "capacity", "stress", "shareLevel" FROM "CheckIn"
      WHERE "familyGroupId" = fm."familyGroupId" AND "userId" = fm."userId"
      ORDER BY "recordedFor" DESC, "createdAt" DESC LIMIT 1
    ) ci ON true
    WHERE fm."familyGroupId" = ${familyId} AND fm."status" = 'active'
    ORDER BY fm."joinedAt" ASC
  `;

  return rows.map((row) => ({
    membershipId: row.membershipId as string,
    userId: row.userId as string,
    name: (row.name as string) ?? (row.accountName as string),
    displayName: (row.userDisplayName as string | null) ?? null,
    email: row.email as string,
    roleKey: (row.roleKey as RoleKey) ?? "member",
    roleName: row.roleName as string,
    permission: row.permission as Permission,
    color: (row.color as string | null) ?? (row.avatarColor as string) ?? "#7855dc",
    capacity: (row.capacity as Capacity | null) ?? Capacity.NORMAL,
    capacityFromCheckIn: Boolean(row.capacity),
    stress: (row.stress as number | null) ?? null,
    shareLevel: (row.shareLevel as string) ?? "band",
    kidProfileId: (row.kidProfileId as string | null) ?? null,
    joinedAt: row.joinedAt as Date,
  }));
}

export function memberInputs(members: NucleusMember[]): MemberLoadInput[] {
  return members.map((member) => ({
    userId: member.userId,
    name: member.name,
    color: member.color,
    roleKey: member.roleKey,
    capacity: member.capacity,
  }));
}

function eventToItem(row: Record<string, unknown>, now: Date): LoadItem {
  const start = new Date(row.startTime as string);
  const end = new Date(row.endTime as string);
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  return {
    id: row.id as string,
    kind: "event",
    title: row.title as string,
    category: row.category as Category,
    primaryAssigneeId: (row.assignedUserId as string | null) ?? null,
    supportAssigneeIds: [row.chaperoneUserId, row.pickupUserId].filter(Boolean) as string[],
    participants: row.kidProfileId ? [row.kidProfileId as string] : [],
    start,
    end,
    estimatedMinutes: minutes,
    preparationMinutes: (row.preparationMinutes as number) ?? 0,
    travelMinutes: (row.travelMinutes as number) ?? 0,
    coordinationMinutes: 0,
    onCallMinutes: 0,
    mentalLoad: (row.requiresBooking as boolean) ? 2 : 1,
    physicalLoad: 1,
    emotionalLoad: (row.emotionalLoad as number) ?? 1,
    urgency: 1,
    predictability: 2,
    flexibility: (row.flexibility as Flexibility) ?? Flexibility.FLEXIBLE,
    rotates: false,
    open: end > now,
  };
}

function taskToItem(row: Record<string, unknown>): LoadItem {
  const due = row.dueAt ? new Date(row.dueAt as string) : null;
  const status = (row.activityStatus as ActivityStatus) ?? ActivityStatus.DRAFT;
  return {
    id: row.id as string,
    kind: "task",
    title: row.title as string,
    category: (row.category as Category) ?? Category.HOUSEHOLD,
    primaryAssigneeId: (row.assignedToId as string | null) ?? null,
    supportAssigneeIds: [],
    participants: row.careProfileId ? [row.careProfileId as string] : [],
    start: due,
    end: due,
    estimatedMinutes: (row.estimatedMinutes as number) ?? 0,
    preparationMinutes: (row.preparationMinutes as number) ?? 0,
    travelMinutes: (row.travelMinutes as number) ?? 0,
    coordinationMinutes: (row.coordinationMinutes as number) ?? 0,
    onCallMinutes: 0,
    mentalLoad: (row.mentalLoad as number) ?? 1,
    physicalLoad: (row.physicalLoad as number) ?? 1,
    emotionalLoad: (row.emotionalLoad as number) ?? 1,
    urgency: (row.urgency as number) ?? 1,
    predictability: (row.predictability as number) ?? 1,
    flexibility: (row.flexibility as Flexibility) ?? Flexibility.FLEXIBLE,
    rotates: Boolean(row.rotates),
    open: isOpenStatus(status),
  };
}

export async function loadLoadItems(familyId: string, period: Period): Promise<LoadItem[]> {
  const now = new Date();
  const [events, tasks] = await Promise.all([
    db`
      SELECT "id", "title", "category", "assignedUserId", "chaperoneUserId", "pickupUserId", "kidProfileId",
        "startTime", "endTime", "preparationMinutes", "travelMinutes", "flexibility", "requiresBooking", "emotionalLoad"
      FROM "Event"
      WHERE "familyGroupId" = ${familyId}
        AND "endTime" > ${period.start} AND "startTime" < ${period.end}
    `,
    db`
      SELECT "id", "title", "category", "assignedToId", "careProfileId", "dueAt", "activityStatus",
        "estimatedMinutes", "preparationMinutes", "travelMinutes", "coordinationMinutes",
        "mentalLoad", "physicalLoad", "emotionalLoad", "urgency", "predictability", "flexibility", "rotates"
      FROM "Task"
      WHERE "familyGroupId" = ${familyId}
        AND ("dueAt" IS NULL OR ("dueAt" >= ${period.start} AND "dueAt" < ${period.end}))
    `,
  ]);

  return [
    ...events.map((row) => eventToItem(row, now)),
    ...tasks.map((row) => taskToItem(row)),
  ];
}

export async function loadWorkload(familyId: string, period: Period): Promise<{ report: WorkloadReport; members: NucleusMember[]; items: LoadItem[] }> {
  const [members, items] = await Promise.all([loadMembers(familyId), loadLoadItems(familyId, period)]);
  return { report: computeWorkload(memberInputs(members), items), members, items };
}

export async function loadScenarioVariants(familyId: string, period: Period): Promise<ScenarioVariantResult[]> {
  const { members, items } = await loadWorkload(familyId, period);
  return buildScenarioVariants(items, memberInputs(members));
}

export type CandidateWithContext = CandidateProfile & { membershipId: string; roleName: string; email: string };

// Costruisce il profilo dei candidati per il motore di equità, senza usare genere o parentela.
export async function buildCandidates(
  familyId: string,
  period: Period,
  options: { itemId?: string; start?: Date | null; durationMinutes?: number; category?: Category } = {},
): Promise<{ candidates: CandidateWithContext[]; report: WorkloadReport; members: NucleusMember[] }> {
  const { report, members, items } = await loadWorkload(familyId, period);
  const previousDays = new Date(period.start);
  previousDays.setDate(previousDays.getDate() - 14);

  const [preferences, recent, history] = await Promise.all([
    db`SELECT "userId", "category", "level" FROM "Preference" WHERE "familyGroupId" = ${familyId}`,
    db`
      SELECT t."assignedToId", COUNT(*)::int AS "count" FROM "Task" t
      WHERE t."familyGroupId" = ${familyId} AND t."assignedToId" IS NOT NULL
        AND t."createdAt" >= ${previousDays}
      GROUP BY t."assignedToId"
    `,
    db`
      SELECT "toUserId", "createdAt" FROM "CareEventHistory"
      WHERE "familyGroupId" = ${familyId} AND "changeType" = 'rotation'
      ORDER BY "createdAt" DESC LIMIT 20
    `,
  ]);

  const preferenceMap = new Map<string, PreferenceLevel>();
  for (const preference of preferences) {
    if (options.category && preference.category === options.category) {
      preferenceMap.set(preference.userId as string, preference.level as PreferenceLevel);
    }
  }

  const recentMap = new Map<string, number>();
  for (const row of recent) recentMap.set(row.assignedToId as string, row.count as number);

  const lastRotated = history[0]?.toUserId as string | undefined;

  const candidates: CandidateWithContext[] = members.map((member) => {
    const load = report.members.find((entry) => entry.userId === member.userId);
    const conflict = options.start && options.durationMinutes
      ? hasOverlap(items, member.userId, options.start, options.durationMinutes, options.itemId)
      : false;
    return {
      userId: member.userId,
      membershipId: member.membershipId,
      name: member.name,
      color: member.color,
      roleName: member.roleName,
      email: member.email,
      roleKey: member.roleKey,
      capacity: member.capacity,
      loadMinutes: load?.totalMinutes ?? 0,
      openCount: load?.openCount ?? 0,
      preference: preferenceMap.get(member.userId) ?? "neutral",
      hasConflict: Boolean(conflict),
      conflictReason: conflict ? `${member.name} ha già un impegno sovrapposto in questa fascia.` : undefined,
      recentAssignments: recentMap.get(member.userId) ?? 0,
      wasLastInRotation: member.userId === lastRotated,
      needsCompany: false,
      availableInWindow: true,
    };
  });

  return { candidates, report, members };
}

function hasOverlap(items: LoadItem[], userId: string, start: Date, durationMinutes: number, excludeId?: string): boolean {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return items.some((item) => {
    if (item.id === excludeId) return false;
    if (item.primaryAssigneeId !== userId && !item.supportAssigneeIds.includes(userId)) return false;
    if (!item.start || !item.end) return false;
    return item.start < end && item.end > start;
  });
}

export function buildEquityRequest(
  title: string,
  category: Category,
  durationMinutes: number,
  flexibility: Flexibility,
  rotates: boolean,
  start: Date | null,
  candidates: CandidateWithContext[],
): AssignmentRequest {
  return { title, category, durationMinutes, start, flexibility, rotates, candidates };
}

export function analyseForAssignment(request: AssignmentRequest): AssignmentAnalysis {
  return analyseAssignment(request);
}

// Testo aggregato (senza nomi propri) per il riepilogo settimanale del Care Orchestrator.
export function buildWeeklySummaryInput(report: WorkloadReport, members: NucleusMember[], period: Period): string {
  const lines: string[] = [];
  const fmt = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" });
  lines.push(`Periodo: ${fmt.format(period.start)} — ${fmt.format(period.end)}.`);
  lines.push(`Carico totale del nucleo: ${Math.round(report.totalMinutes / 60 * 10) / 10} ore.`);
  lines.push(`Attività senza responsabile: ${report.unassignedCount}.`);
  lines.push(`Minuti di coordinamento: ${report.coordinationMinutes}. Minuti di reperibilità: ${report.onCallMinutes}.`);
  lines.push(`Concentrazione del carico (0 = equilibrato, 100 = tutto su una persona): ${Math.round(report.concentration * 100)}.`);
  for (const member of report.members) {
    const source = members.find((entry) => entry.userId === member.userId);
    const parts = [
      `${member.name}: ${Math.round(member.totalMinutes / 60 * 10) / 10}h totali`,
      `${member.activityCount} attività`,
      `${member.openCount} aperte`,
      `carico mentale ${Math.round(member.mentalLoadScore)}`,
      `capacità ${member.capacity}`,
    ];
    if (source?.stress != null) parts.push(`stress dichiarato ${source.stress}/5`);
    lines.push(`- ${parts.join(", ")}.`);
  }
  const dimensions = report.members.reduce(
    (acc, member) => ({
      operational: acc.operational + member.minutes.operationalMinutes,
      care: acc.care + member.minutes.careMinutes,
      household: acc.household + member.minutes.householdMinutes,
      coordination: acc.coordination + member.minutes.coordinationMinutes,
      onCall: acc.onCall + member.minutes.onCallMinutes,
    }),
    { operational: 0, care: 0, household: 0, coordination: 0, onCall: 0 },
  );
  lines.push(
    `Ripartizione ore: operativo ${Math.round(dimensions.operational / 60 * 10) / 10}h, cura ${Math.round(dimensions.care / 60 * 10) / 10}h, casa ${Math.round(dimensions.household / 60 * 10) / 10}h, coordinamento ${Math.round(dimensions.coordination / 60 * 10) / 10}h, reperibilità ${Math.round(dimensions.onCall / 60 * 10) / 10}h.`,
  );
  return lines.join("\n");
}

export function categoryColor(category: string): string {
  return CATEGORY_META[category as Category]?.color ?? "#7c6bd6";
}
