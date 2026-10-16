"use server";

import { EventStatus, Permission } from "@/lib/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateTimeFromLocal, isCalendarDate } from "@/lib/datetime";
import { requireFamilyCoordinator } from "@/lib/family";
import { db } from "@/lib/db";

const eventSchema = z.object({
  title: z.string().trim().min(1, "Inserisci il titolo dell’impegno.").max(120),
  date: z.string().refine(isCalendarDate, "Inserisci una data valida."),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Inserisci un orario di inizio valido."),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Inserisci un orario di fine valido."),
  category: z.enum(["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE"]),
  participantId: z.string().optional(),
  assignedUserId: z.string().optional(),
  chaperoneUserId: z.string().optional(),
  pickupUserId: z.string().optional(),
  location: z.string().trim().max(180).optional(),
  description: z.string().trim().max(1000).optional(),
  autoAssign: z.enum(["true", "false"]).optional(),
});

function parseEvent(formData: FormData) {
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "I dati dell’impegno non sono validi.");
  if (parsed.data.end <= parsed.data.start) throw new Error("L’orario di fine deve essere successivo all’orario di inizio.");
  return parsed.data;
}

async function validateFamilyUsers(familyId: string, userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const members = await db`SELECT "userId" FROM "FamilyMember" WHERE "familyGroupId" = ${familyId}`;
  const validIds = new Set(members.map((member) => member.userId));
  if (ids.some((id) => !validIds.has(id))) {
    throw new Error("Un familiare selezionato non appartiene a questo gruppo.");
  }
}

async function memberConflicts(familyId: string, userId: string, start: Date, end: Date, excludeEventId?: string) {
  const conflicts = await db`
    SELECT "id" FROM "Event"
    WHERE "familyGroupId" = ${familyId}
      AND (${excludeEventId ?? null}::text IS NULL OR "id" <> ${excludeEventId ?? null})
      AND "startTime" < ${end} AND "endTime" > ${start}
      AND ("assignedUserId" = ${userId} OR "chaperoneUserId" = ${userId} OR "pickupUserId" = ${userId})
    LIMIT 1
  `;
  return conflicts.length > 0;
}

function hasWorkScheduleConflict(schedule: unknown, start: Date, end: Date, timeZone: string) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule) || !("unavailable" in schedule)) return false;
  const unavailable = schedule.unavailable;
  if (!Array.isArray(unavailable)) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const startParts = Object.fromEntries(parts.formatToParts(start).map((part) => [part.type, part.value]));
  const endParts = Object.fromEntries(parts.formatToParts(end).map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(startParts.weekday);
  const startMinutes = Number(startParts.hour) * 60 + Number(startParts.minute);
  const endMinutes = Number(endParts.hour) * 60 + Number(endParts.minute);
  return unavailable.some((block) => {
    if (typeof block !== "object" || block === null) return false;
    const item = block as { day?: unknown; start?: unknown; end?: unknown };
    if (item.day !== weekday || typeof item.start !== "string" || typeof item.end !== "string") return false;
    const [startHour, startMinute] = item.start.split(":").map(Number);
    const [endHour, endMinute] = item.end.split(":").map(Number);
    return startMinutes < endHour * 60 + endMinute && endMinutes > startHour * 60 + startMinute;
  });
}

async function chooseAvailableAssignee(
  familyId: string,
  start: Date,
  end: Date,
  timeZone: string,
  preferredUserId?: string,
) {
  const memberships = await db`
    SELECT fm."permission", u."id" AS "userId", u."workSchedule"
    FROM "FamilyMember" fm JOIN "User" u ON u."id" = fm."userId"
    WHERE fm."familyGroupId" = ${familyId} AND fm."permission" IN (${Permission.ADMIN}, ${Permission.HELPER})
  `;
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  const nextDate = new Date(`${localDate}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endOfDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nextDate);
  const existingEvents = await db`
    SELECT "assignedUserId", "chaperoneUserId", "pickupUserId" FROM "Event"
    WHERE "familyGroupId" = ${familyId}
      AND "startTime" < ${dateTimeFromLocal(endOfDay, "00:00", timeZone)}
      AND "endTime" > ${dateTimeFromLocal(localDate, "00:00", timeZone)}
  `;
  const workloads = new Map<string, number>();
  for (const event of existingEvents) {
    for (const id of new Set([event.assignedUserId, event.chaperoneUserId, event.pickupUserId].filter(Boolean))) {
      workloads.set(id, (workloads.get(id) ?? 0) + 1);
    }
  }
  const ordered = [...memberships].sort((a, b) => {
    const rank = (permission: Permission) => permission === Permission.ADMIN ? 0 : 1;
    return rank(a.permission) - rank(b.permission) ||
      (workloads.get(a.userId) ?? 0) - (workloads.get(b.userId) ?? 0);
  });
  const candidates = preferredUserId ? ordered.filter((item) => item.userId === preferredUserId) : ordered;
  for (const candidate of candidates) {
    if (hasWorkScheduleConflict(candidate.workSchedule, start, end, timeZone)) continue;
    if (await memberConflicts(familyId, candidate.userId, start, end)) continue;
    return candidate.userId;
  }
  return null;
}

async function validateParticipant(familyId: string, participantValue: string | undefined) {
  const [participantType, participantId] = (participantValue || "").split(":");
  if (participantType === "kid" && participantId) {
    const [kid] = await db`
      SELECT "id" FROM "KidProfile" WHERE "id" = ${participantId} AND "familyGroupId" = ${familyId} LIMIT 1
    `;
    if (!kid) throw new Error("Il profilo del figlio selezionato non appartiene a questa famiglia.");
  } else if (participantType === "user" && participantId) {
    await validateFamilyUsers(familyId, [participantId]);
  } else if (participantValue) {
    throw new Error("Il familiare selezionato non è valido.");
  }
  return { participantType, participantId };
}

export async function createEvent(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const input = parseEvent(formData);
  const startTime = dateTimeFromLocal(input.date, input.start, context.family.timezone);
  const endTime = dateTimeFromLocal(input.date, input.end, context.family.timezone);
  const { participantType, participantId } = await validateParticipant(context.familyId, input.participantId);
  const chaperoneUserId = input.chaperoneUserId || null;
  const pickupUserId = input.pickupUserId || null;
  await validateFamilyUsers(context.familyId, [input.assignedUserId ?? "", chaperoneUserId ?? "", pickupUserId ?? ""]);

  let assignedUserId = input.assignedUserId || (participantType === "user" ? participantId : "") || null;
  let status: EventStatus = EventStatus.UNASSIGNED;
  if (input.autoAssign === "true" || assignedUserId) {
    const available = await chooseAvailableAssignee(
      context.familyId,
      startTime,
      endTime,
      context.family.timezone,
      assignedUserId || undefined,
    );
    if (available) {
      assignedUserId = available;
      status = EventStatus.CONFIRMED;
    } else {
      status = EventStatus.CONFLICT;
    }
  }

  if (participantType === "kid" && participantId) {
    const [kidOverlap] = await db`
      SELECT "id" FROM "Event"
      WHERE "familyGroupId" = ${context.familyId} AND "kidProfileId" = ${participantId}
        AND "startTime" < ${endTime} AND "endTime" > ${startTime}
      LIMIT 1
    `;
    if (kidOverlap) status = EventStatus.CONFLICT;
  }
  for (const userId of [chaperoneUserId, pickupUserId]) {
    if (userId && await memberConflicts(context.familyId, userId, startTime, endTime)) status = EventStatus.CONFLICT;
  }

  await db`
    INSERT INTO "Event" (
      "id", "familyGroupId", "title", "startTime", "endTime", "category", "status",
      "location", "description", "assignedUserId", "chaperoneUserId", "pickupUserId", "kidProfileId", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${context.familyId}, ${input.title}, ${startTime}, ${endTime}, ${input.category}, ${status},
      ${input.location || null}, ${input.description || null}, ${assignedUserId}, ${chaperoneUserId}, ${pickupUserId},
      ${participantType === "kid" ? participantId : null}, NOW()
    )
  `;

  revalidatePath("/calendar");
  revalidatePath("/tasks");
  return { success: true, status, assignedUserId };
}

export async function updateEvent(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Impegno non valido.");
  const [event] = await db`
    SELECT "id" FROM "Event" WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!event) throw new Error("Impegno non trovato.");

  const input = parseEvent(formData);
  const startTime = dateTimeFromLocal(input.date, input.start, context.family.timezone);
  const endTime = dateTimeFromLocal(input.date, input.end, context.family.timezone);
  const { participantType, participantId } = await validateParticipant(context.familyId, input.participantId);
  const assignedUserId = input.assignedUserId || (participantType === "user" ? participantId : "") || null;
  const chaperoneUserId = input.chaperoneUserId || null;
  const pickupUserId = input.pickupUserId || null;
  await validateFamilyUsers(context.familyId, [assignedUserId ?? "", chaperoneUserId ?? "", pickupUserId ?? ""]);

  let status: EventStatus = assignedUserId ? EventStatus.CONFIRMED : EventStatus.UNASSIGNED;
  for (const userId of [assignedUserId, chaperoneUserId, pickupUserId]) {
    if (userId && await memberConflicts(context.familyId, userId, startTime, endTime, event.id)) status = EventStatus.CONFLICT;
  }
  if (participantType === "kid" && participantId) {
    const [conflict] = await db`
      SELECT "id" FROM "Event"
      WHERE "familyGroupId" = ${context.familyId} AND "id" <> ${event.id} AND "kidProfileId" = ${participantId}
        AND "startTime" < ${endTime} AND "endTime" > ${startTime}
      LIMIT 1
    `;
    if (conflict) status = EventStatus.CONFLICT;
  }
  if (assignedUserId) {
    const [membership] = await db`
      SELECT u."workSchedule" FROM "FamilyMember" fm
      JOIN "User" u ON u."id" = fm."userId"
      WHERE fm."familyGroupId" = ${context.familyId} AND fm."userId" = ${assignedUserId} LIMIT 1
    `;
    if (membership && hasWorkScheduleConflict(membership.workSchedule, startTime, endTime, context.family.timezone)) {
      status = EventStatus.CONFLICT;
    }
  }

  await db`
    UPDATE "Event" SET
      "title" = ${input.title}, "startTime" = ${startTime}, "endTime" = ${endTime},
      "category" = ${input.category}, "status" = ${status}, "location" = ${input.location || null},
      "description" = ${input.description || null}, "assignedUserId" = ${assignedUserId},
      "chaperoneUserId" = ${chaperoneUserId}, "pickupUserId" = ${pickupUserId},
      "kidProfileId" = ${participantType === "kid" ? participantId : null}, "updatedAt" = NOW()
    WHERE "id" = ${event.id} AND "familyGroupId" = ${context.familyId}
  `;
  revalidatePath("/calendar");
}

export async function deleteEvent(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Impegno non valido.");
  await db`DELETE FROM "Event" WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId}`;
  revalidatePath("/calendar");
}

export async function claimEvent(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const id = z.string().min(1).safeParse(formData.get("id"));
  const role = z.enum(["assigned", "chaperone", "pickup"]).safeParse(formData.get("role"));
  if (!id.success || !role.success) throw new Error("Presa in carico non valida.");
  const [event] = await db`
    SELECT "id", "assignedUserId", "chaperoneUserId", "pickupUserId"
    FROM "Event" WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!event) throw new Error("Impegno non trovato.");
  if (role.data === "chaperone") {
    await db`UPDATE "Event" SET "chaperoneUserId" = ${context.userId}, "status" = ${EventStatus.CONFIRMED}, "updatedAt" = NOW() WHERE "id" = ${event.id} AND "familyGroupId" = ${context.familyId}`;
  } else if (role.data === "pickup") {
    await db`UPDATE "Event" SET "pickupUserId" = ${context.userId}, "status" = ${EventStatus.CONFIRMED}, "updatedAt" = NOW() WHERE "id" = ${event.id} AND "familyGroupId" = ${context.familyId}`;
  } else {
    await db`UPDATE "Event" SET "assignedUserId" = ${context.userId}, "status" = ${EventStatus.CONFIRMED}, "updatedAt" = NOW() WHERE "id" = ${event.id} AND "familyGroupId" = ${context.familyId}`;
  }
  revalidatePath("/calendar");
  revalidatePath("/tasks");
  return { success: true };
}

export async function moveEvent(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const id = z.string().min(1).safeParse(formData.get("id"));
  const date = z.string().refine(isCalendarDate).safeParse(formData.get("date"));
  const start = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).safeParse(formData.get("start"));
  if (!id.success || !date.success || !start.success) throw new Error("Spostamento non valido.");
  const [event] = await db`
    SELECT "id", "startTime", "endTime", "assignedUserId", "chaperoneUserId", "pickupUserId", "kidProfileId"
    FROM "Event" WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!event) throw new Error("Impegno non trovato.");

  const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
  const startTime = dateTimeFromLocal(date.data, start.data, context.family.timezone);
  const endTime = new Date(startTime.getTime() + duration);
  let conflict = false;
  for (const userId of [event.assignedUserId, event.chaperoneUserId, event.pickupUserId]) {
    if (userId && await memberConflicts(context.familyId, userId, startTime, endTime, event.id)) conflict = true;
  }
  if (event.assignedUserId) {
    const [membership] = await db`
      SELECT u."workSchedule" FROM "FamilyMember" fm
      JOIN "User" u ON u."id" = fm."userId"
      WHERE fm."familyGroupId" = ${context.familyId} AND fm."userId" = ${event.assignedUserId} LIMIT 1
    `;
    if (membership && hasWorkScheduleConflict(membership.workSchedule, startTime, endTime, context.family.timezone)) {
      conflict = true;
    }
  }
  let kidConflict = false;
  if (event.kidProfileId) {
    const [overlap] = await db`
      SELECT "id" FROM "Event"
      WHERE "familyGroupId" = ${context.familyId} AND "id" <> ${event.id} AND "kidProfileId" = ${event.kidProfileId}
        AND "startTime" < ${endTime} AND "endTime" > ${startTime}
      LIMIT 1
    `;
    kidConflict = Boolean(overlap);
  }
  const status = conflict || kidConflict
    ? EventStatus.CONFLICT
    : event.assignedUserId ? EventStatus.CONFIRMED : EventStatus.UNASSIGNED;
  await db`
    UPDATE "Event" SET "startTime" = ${startTime}, "endTime" = ${endTime}, "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${event.id} AND "familyGroupId" = ${context.familyId}
  `;
  revalidatePath("/calendar");
}
