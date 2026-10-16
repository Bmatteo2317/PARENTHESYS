"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActivityStatus, Category, Flexibility, TaskStatus } from "@/lib/domain";
import { getFamilyContext, requirePermission } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify, notifyCoordinators } from "@/lib/notify";
import { dateTimeFromLocal, isCalendarDate } from "@/lib/datetime";
import {
  analyseForAssignment,
  buildCandidates,
  buildEquityRequest,
  weekRange,
  type CandidateWithContext,
} from "@/lib/insights";
import { type Alternative, type EquityOption, simulateImpact, type AlternativeKind, buildAlternatives } from "@/lib/equity";

const categorySchema = z.enum(["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE", "CARE", "ERRANDS", "ADMIN", "COMMUNITY"]);
const flexibilitySchema = z.enum(["fixed", "semi_flexible", "flexible"]);

const activitySchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(600).optional(),
  category: categorySchema,
  estimatedMinutes: z.coerce.number().int().min(0).max(1440),
  preparationMinutes: z.coerce.number().int().min(0).max(240).default(0),
  travelMinutes: z.coerce.number().int().min(0).max(240).default(0),
  coordinationMinutes: z.coerce.number().int().min(0).max(240).default(0),
  mentalLoad: z.coerce.number().int().min(1).max(5).default(1),
  physicalLoad: z.coerce.number().int().min(1).max(5).default(1),
  emotionalLoad: z.coerce.number().int().min(1).max(5).default(1),
  urgency: z.coerce.number().int().min(1).max(5).default(1),
  predictability: z.coerce.number().int().min(1).max(5).default(1),
  flexibility: flexibilitySchema.default("flexible"),
  rotates: z.enum(["true", "false"]).optional(),
  dueDate: z.string().refine(isCalendarDate).optional(),
  dueAt: z.string().optional(),
  careProfileId: z.string().optional(),
  source: z.string().optional(),
});

export type AssignmentPreview = {
  title: string;
  category: Category;
  durationMinutes: number;
  startIso: string | null;
  flexibility: Flexibility;
  rotates: boolean;
  options: EquityOption[];
  alternatives: Alternative[];
  impacts: { userId: string; name: string; color: string; narrative: string; becomesLessBalanced: boolean; deltaConcentration: number }[];
  recommendedUserId: string | null;
  unassigned: boolean;
};

function parseDueAt(input: { dueDate?: string; dueAt?: string }, timeZone: string): Date | null {
  if (input.dueDate && input.dueAt) return dateTimeFromLocal(input.dueDate, input.dueAt, timeZone);
  if (input.dueAt) {
    const parsed = new Date(input.dueAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

// Creare un'attività significa descrivere il lavoro che serve davvero, non solo il titolo.
export async function createActivity(formData: FormData) {
  const context = await requirePermission("event.create");
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "I dati dell'attività non sono validi.");
  const input = parsed.data;

  if (input.careProfileId) {
    const [profile] = await db`
      SELECT "id" FROM "KidProfile" WHERE "id" = ${input.careProfileId} AND "familyGroupId" = ${context.familyId} LIMIT 1
    `;
    if (!profile) throw new Error("La persona assistita scelta non appartiene a questo nucleo.");
  }

  const dueAt = parseDueAt(input, context.family.timezone);
  const dueDate = dueAt ?? new Date();

  const [created] = await db`
    INSERT INTO "Task" (
      "id", "familyGroupId", "title", "description", "status", "assignedToId", "dueDate", "dueAt", "points",
      "activityStatus", "category", "estimatedMinutes", "preparationMinutes", "travelMinutes", "coordinationMinutes",
      "mentalLoad", "physicalLoad", "emotionalLoad", "urgency", "predictability", "flexibility", "rotates",
      "careProfileId", "visibility", "createdById", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${context.familyId}, ${input.title}, ${input.description ?? null}, ${TaskStatus.PENDING},
      ${null}, ${dueDate}, ${dueAt}, 0, ${ActivityStatus.UNASSIGNED}, ${input.category}, ${input.estimatedMinutes},
      ${input.preparationMinutes}, ${input.travelMinutes}, ${input.coordinationMinutes}, ${input.mentalLoad},
      ${input.physicalLoad}, ${input.emotionalLoad}, ${input.urgency}, ${input.predictability}, ${input.flexibility},
      ${input.rotates === "true"}, ${input.careProfileId || null}, 'household', ${context.userId}, NOW()
    )
    RETURNING "id"
  `;

  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "activity.create",
    entityType: "Task",
    entityId: created.id as string,
    afterValue: { title: input.title, category: input.category, estimatedMinutes: input.estimatedMinutes },
  });

  revalidatePath("/careboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
  return { id: created.id as string };
}

// Simulare l'impatto prima di decidere: il motore mostra scenari, non ordini.
export async function previewAssignment(formData: FormData): Promise<AssignmentPreview> {
  const context = await getFamilyContext();
  const parsed = activitySchema.partial().safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Dati insufficienti per stimare l'impatto.");
  const input = parsed.data;
  const title = input.title?.trim() || "Nuova attività";
  const category = (input.category ?? "HOUSEHOLD") as Category;
  const durationMinutes =
    (input.estimatedMinutes ?? 30) + (input.preparationMinutes ?? 0) + (input.travelMinutes ?? 0) + (input.coordinationMinutes ?? 0);
  const flexibility = (input.flexibility ?? "flexible") as Flexibility;
  const rotates = input.rotates === "true";
  const start = parseDueAt(input, context.family.timezone);

  const period = weekRange(start ?? new Date());
  const { candidates, report } = await buildCandidates(context.familyId, period, {
    start,
    durationMinutes,
    category,
  });

  const request = buildEquityRequest(title, category, durationMinutes, flexibility, rotates, start, candidates);
  const analysis = analyseForAssignment(request);
  const alternatives = buildAlternatives(request, analysis);
  const loads = report.members.map((member) => ({ userId: member.userId, name: member.name, minutes: member.totalMinutes }));
  const impacts = candidates.map((candidate: CandidateWithContext) => {
    const summary = simulateImpact(loads, candidate.userId, durationMinutes);
    return {
      userId: candidate.userId,
      name: candidate.name,
      color: candidate.color,
      narrative: summary.narrative,
      becomesLessBalanced: summary.becomesLessBalanced,
      deltaConcentration: summary.deltaConcentration,
    };
  });

  return {
    title,
    category,
    durationMinutes,
    startIso: start ? start.toISOString() : null,
    flexibility,
    rotates,
    options: analysis.options,
    alternatives,
    impacts,
    recommendedUserId: analysis.recommended?.userId ?? null,
    unassigned: analysis.unassigned,
  };
}

const assignSchema = z.object({
  activityId: z.string().min(1),
  assigneeId: z.string().min(1),
  source: z.enum(["manual", "equity", "rotation", "ai"]).default("manual"),
  explanation: z.string().trim().max(400).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function assignActivity(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Assegnazione non valida.");
  const { activityId, assigneeId, source, explanation } = parsed.data;

  const [task] = await db`
    SELECT "id", "title", "assignedToId", "activityStatus" FROM "Task"
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!task) throw new Error("Attività non trovata.");

  const [member] = await db`
    SELECT "id" FROM "FamilyMember"
    WHERE "userId" = ${assigneeId} AND "familyGroupId" = ${context.familyId} AND "status" = 'active' LIMIT 1
  `;
  if (!member) throw new Error("La persona scelta non fa parte di questo nucleo.");

  await db`
    UPDATE "Task" SET "assignedToId" = ${assigneeId}, "activityStatus" = ${ActivityStatus.ASSIGNED}, "updatedAt" = NOW()
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId}
  `;
  await db`
    INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "status", "source", "explanation", "createdById")
    VALUES (gen_random_uuid()::text, ${activityId}, ${assigneeId}, 'primary', 'proposed', ${source}, ${explanation ?? null}, ${context.userId})
  `;
  await db`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "fromStatus", "toStatus", "actorUserId")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${activityId}, 'assignment', ${task.assignedToId ?? null}, ${assigneeId},
      ${task.activityStatus ?? null}, ${ActivityStatus.ASSIGNED}, ${context.userId})
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "activity.assign",
    entityType: "Task",
    entityId: activityId,
    beforeValue: { assignedToId: task.assignedToId },
    afterValue: { assignedToId: assigneeId, source },
  });
  await notify({
    familyGroupId: context.familyId,
    userId: assigneeId,
    type: "assignment",
    priority: "normal",
    title: `Ti è stata proposta "${task.title}"`,
    body: explanation ?? "Puoi accettare, chiedere supporto o declinare con una nota.",
    entityType: "Task",
    entityId: activityId,
  });

  revalidatePath("/careboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
  revalidatePath("/support");
}

const respondSchema = z.object({
  activityId: z.string().min(1),
  response: z.enum(["accept", "decline"]),
  message: z.string().trim().max(400).optional(),
});

export async function respondToAssignment(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Risposta non valida.");
  const { activityId, response, message } = parsed.data;

  const [task] = await db`
    SELECT "id", "title", "assignedToId" FROM "Task"
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!task) throw new Error("Attività non trovata.");
  if (task.assignedToId !== context.userId && !context.isAdmin) {
    throw new Error("Puoi rispondere solo alle attività assegnate a te.");
  }

  const nextStatus = response === "accept" ? ActivityStatus.ACCEPTED : ActivityStatus.DECLINED;
  await db`
    UPDATE "Task" SET "activityStatus" = ${nextStatus}, "updatedAt" = NOW()
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId}
  `;
  await db`
    UPDATE "TaskAssignment" SET "status" = ${response === "accept" ? "accepted" : "declined"}, "respondedAt" = NOW()
    WHERE "taskId" = ${activityId} AND "userId" = ${context.userId}
      AND "id" = (SELECT "id" FROM "TaskAssignment" WHERE "taskId" = ${activityId} AND "userId" = ${context.userId} ORDER BY "createdAt" DESC LIMIT 1)
  `;
  await db`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "toStatus", "note", "actorUserId")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${activityId}, ${response === "accept" ? "accept" : "decline"},
      ${context.userId}, ${null}, ${nextStatus}, ${message ?? null}, ${context.userId})
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: `activity.${response}`,
    entityType: "Task",
    entityId: activityId,
    reason: message,
  });

  if (response === "decline") {
    await notifyCoordinators(context.familyId, context.userId, {
      type: "decline",
      priority: "high",
      title: `"${task.title}" è stata declinata`,
      body: message ?? "Qualcuno ha segnalato di non poter coprire questa attività. Serve una nuova proposta.",
      entityType: "Task",
      entityId: activityId,
    });
  } else {
    await notifyCoordinators(context.familyId, context.userId, {
      type: "accept",
      title: `"${task.title}" è stata accettata`,
      entityType: "Task",
      entityId: activityId,
    });
  }

  revalidatePath("/careboard");
  revalidatePath("/tasks");
}

const statusSchema = z.object({
  activityId: z.string().min(1),
  status: z.enum(["in_progress", "blocked", "completed", "skipped", "cancelled", "needs_review"]),
});

export async function setActivityStatus(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Stato non valido.");
  const { activityId, status } = parsed.data;

  const [task] = await db`
    SELECT "id", "title", "assignedToId", "activityStatus" FROM "Task"
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!task) throw new Error("Attività non trovata.");
  if (task.assignedToId !== context.userId && !context.isAdmin && context.membership.permission === "MEMBER") {
    throw new Error("Puoi aggiornare solo le attività che ti riguardano.");
  }

  const completed = status === "completed";
  await db`
    UPDATE "Task" SET "activityStatus" = ${status}, "status" = ${completed ? TaskStatus.COMPLETED : TaskStatus.PENDING},
      "completedAt" = ${completed ? new Date() : null}, "updatedAt" = NOW()
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId}
  `;
  await db`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromStatus", "toStatus", "actorUserId")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${activityId}, 'status', ${task.activityStatus ?? null}, ${status}, ${context.userId})
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "activity.status",
    entityType: "Task",
    entityId: activityId,
    beforeValue: { activityStatus: task.activityStatus },
    afterValue: { activityStatus: status },
  });

  revalidatePath("/careboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
}

const rotateSchema = z.object({
  activityId: z.string().min(1),
  toUserId: z.string().optional(),
  strategy: z.enum(["least_loaded", "next_in_line", "explicit"]).default("least_loaded"),
});

// La rotazione è esplicita e visibile: chi ha coperto l'ultimo turno non è il primo della fila.
export async function rotateActivity(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = rotateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Rotazione non valida.");
  const { activityId, toUserId, strategy } = parsed.data;

  const [task] = await db`
    SELECT "id", "title", "assignedToId" FROM "Task"
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!task) throw new Error("Attività non trovata.");

  let target = toUserId ?? null;
  if (!target) {
    const period = weekRange(new Date());
    const { candidates } = await buildCandidates(context.familyId, period);
    const eligible = candidates
      .filter((candidate) => candidate.userId !== task.assignedToId)
      .sort((a, b) => a.loadMinutes - b.loadMinutes);
    target = eligible[0]?.userId ?? null;
  }
  if (!target) throw new Error("Non ci sono altre persone disponibili per la rotazione.");

  const [member] = await db`
    SELECT "id" FROM "FamilyMember"
    WHERE "userId" = ${target} AND "familyGroupId" = ${context.familyId} AND "status" = 'active' LIMIT 1
  `;
  if (!member) throw new Error("La persona scelta non fa parte di questo nucleo.");

  await db`
    UPDATE "Task" SET "assignedToId" = ${target}, "activityStatus" = ${ActivityStatus.ASSIGNED}, "updatedAt" = NOW()
    WHERE "id" = ${activityId} AND "familyGroupId" = ${context.familyId}
  `;
  await db`
    INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "status", "source", "createdById")
    VALUES (gen_random_uuid()::text, ${activityId}, ${target}, 'primary', 'proposed', 'rotation', ${context.userId})
  `;
  await db`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "actorUserId")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${activityId}, 'rotation', ${task.assignedToId ?? null}, ${target}, ${context.userId})
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "activity.rotate",
    entityType: "Task",
    entityId: activityId,
    beforeValue: { assignedToId: task.assignedToId },
    afterValue: { assignedToId: target, strategy },
  });
  await notify({
    familyGroupId: context.familyId,
    userId: target,
    type: "rotation",
    title: `Turno di rotazione: "${task.title}"`,
    body: "Questa attività ruota tra più persone per non pesare sempre sulle stesse.",
    entityType: "Task",
    entityId: activityId,
  });

  revalidatePath("/careboard");
  revalidatePath("/tasks");
  revalidatePath("/workload");
}

const supportRequestSchema = z.object({
  taskId: z.string().optional(),
  message: z.string().trim().min(3).max(600),
  reasonType: z.enum(["need_help", "cannot_attend", "need_company", "need_equipment", "need_time"]).default("need_help"),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
});

// Chiedere aiuto non è un fallimento: è un modo per rendere visibile un bisogno.
export async function createSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = supportRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Descrivi la richiesta in modo più chiaro.");
  const input = parsed.data;

  if (input.taskId) {
    const [task] = await db`
      SELECT "id" FROM "Task" WHERE "id" = ${input.taskId} AND "familyGroupId" = ${context.familyId} LIMIT 1
    `;
    if (!task) throw new Error("L'attività collegata non esiste in questo nucleo.");
  }

  const [created] = await db`
    INSERT INTO "SupportRequest" ("id", "familyGroupId", "taskId", "createdById", "message", "reasonType", "windowStart", "windowEnd", "status")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${input.taskId || null}, ${context.userId}, ${input.message},
      ${input.reasonType}, ${input.windowStart ? new Date(input.windowStart) : null}, ${input.windowEnd ? new Date(input.windowEnd) : null}, 'open')
    RETURNING "id"
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "support.request",
    entityType: "SupportRequest",
    entityId: created.id as string,
    afterValue: { reasonType: input.reasonType },
  });
  await notifyCoordinators(context.familyId, context.userId, {
    type: "support_request",
    priority: "high",
    title: "Una richiesta di aiuto è aperta",
    body: input.message,
    entityType: "SupportRequest",
    entityId: created.id as string,
  });

  revalidatePath("/support");
  revalidatePath("/careboard");
}

const supportResponseSchema = z.object({
  requestId: z.string().min(1),
  response: z.enum(["accept", "alternative", "decline"]),
  message: z.string().trim().max(400).optional(),
});

export async function respondToSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = supportResponseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Risposta non valida.");
  const { requestId, response, message } = parsed.data;

  const [request] = await db`
    SELECT "id", "createdById", "taskId", "status" FROM "SupportRequest"
    WHERE "id" = ${requestId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!request) throw new Error("Richiesta non trovata.");

  await db`
    INSERT INTO "SupportResponse" ("id", "requestId", "userId", "response", "message")
    VALUES (gen_random_uuid()::text, ${requestId}, ${context.userId}, ${response}, ${message ?? null})
  `;

  if (response === "accept") {
    await db`
      UPDATE "SupportRequest" SET "status" = 'resolved', "resolvedByUserId" = ${context.userId}, "resolvedAt" = NOW()
      WHERE "id" = ${requestId} AND "familyGroupId" = ${context.familyId}
    `;
    if (request.taskId) {
      await db`
        UPDATE "Task" SET "assignedToId" = ${context.userId}, "activityStatus" = ${ActivityStatus.ASSIGNED}, "updatedAt" = NOW()
        WHERE "id" = ${request.taskId} AND "familyGroupId" = ${context.familyId}
      `;
    }
  }

  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: `support.${response}`,
    entityType: "SupportRequest",
    entityId: requestId,
  });
  await notify({
    familyGroupId: context.familyId,
    userId: request.createdById as string,
    type: "support_response",
    title: response === "accept" ? "Qualcuno ha raccolto la tua richiesta" : "È arrivata una risposta alla tua richiesta",
    body: message ?? undefined,
    entityType: "SupportRequest",
    entityId: requestId,
  });

  revalidatePath("/support");
  revalidatePath("/careboard");
}

// Applica una delle mosse collaborative suggerite dal motore di equità.
export async function applyAlternative(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = z
    .object({ activityId: z.string().min(1), kind: z.enum(["assign", "rotate", "support", "move", "split", "confirm"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Alternativa non valida.");
  const kind = parsed.data.kind as AlternativeKind;

  if (kind === "rotate") {
    const rotate = new FormData();
    rotate.set("activityId", parsed.data.activityId);
    rotate.set("strategy", "least_loaded");
    await rotateActivity(rotate);
    return;
  }
  if (kind === "support") {
    const request = new FormData();
    request.set("taskId", parsed.data.activityId);
    request.set("message", "Serve una mano su questa attività: chi può coprirla?");
    request.set("reasonType", "need_help");
    await createSupportRequest(request);
    return;
  }
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: `activity.alternative.${kind}`,
    entityType: "Task",
    entityId: parsed.data.activityId,
  });
  revalidatePath("/careboard");
}
