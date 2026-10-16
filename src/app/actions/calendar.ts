"use server";

import { Category, EventStatus, Permission, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateTimeFromLocal } from "@/lib/datetime";
import { requireAdmin } from "@/lib/family";
import { prisma } from "@/lib/prisma";

const eventSchema = z.object({
  title: z.string().trim().min(1, "Inserisci il titolo dell’impegno.").max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  category: z.nativeEnum(Category),
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
  const count = await prisma.familyMember.count({ where: { familyGroupId: familyId, userId: { in: ids } } });
  if (count !== ids.length) throw new Error("Un familiare selezionato non appartiene a questo gruppo.");
}

async function memberConflicts(familyId: string, userId: string, start: Date, end: Date, excludeEventId?: string) {
  return prisma.event.findFirst({
    where: {
      familyGroupId: familyId,
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      startTime: { lt: end },
      endTime: { gt: start },
      OR: [
        { assignedUserId: userId },
        { chaperoneUserId: userId },
        { pickupUserId: userId },
      ],
    },
    select: { id: true },
  });
}

function hasWorkScheduleConflict(schedule: Prisma.JsonValue | null, start: Date, end: Date, timeZone: string) {
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
  const toMinutes = (hour: string, minute: string) => Number(hour) * 60 + Number(minute);
  const startMinutes = toMinutes(startParts.hour, startParts.minute);
  const endMinutes = toMinutes(endParts.hour, endParts.minute);
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
  const memberships = await prisma.familyMember.findMany({
    where: { familyGroupId: familyId, permission: { in: [Permission.ADMIN, Permission.HELPER] } },
    include: { user: { select: { id: true, workSchedule: true } } },
  });
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
  const existingEvents = await prisma.event.findMany({
    where: {
      familyGroupId: familyId,
      startTime: { gte: dateTimeFromLocal(localDate, "00:00", timeZone), lt: dateTimeFromLocal(endOfDay, "00:00", timeZone) },
    },
    select: { assignedUserId: true, chaperoneUserId: true, pickupUserId: true },
  });
  const workloads = new Map<string, number>();
  for (const event of existingEvents) {
    for (const id of new Set([event.assignedUserId, event.chaperoneUserId, event.pickupUserId].filter(Boolean))) {
      workloads.set(id!, (workloads.get(id!) ?? 0) + 1);
    }
  }
  const ordered = [...memberships].sort((a, b) => {
    const rank = (permission: Permission) => permission === Permission.ADMIN ? 0 : 1;
    return rank(a.permission) - rank(b.permission) ||
      (workloads.get(a.user.id) ?? 0) - (workloads.get(b.user.id) ?? 0);
  });
  const candidates = preferredUserId
    ? ordered.filter((item) => item.user.id === preferredUserId)
    : ordered;
  for (const candidate of candidates) {
    if (hasWorkScheduleConflict(candidate.user.workSchedule, start, end, timeZone)) continue;
    if (await memberConflicts(familyId, candidate.user.id, start, end)) continue;
    return candidate.user.id;
  }
  return null;
}

export async function createEvent(formData: FormData) {
  const context = await requireAdmin();
  const input = parseEvent(formData);
  const startTime = dateTimeFromLocal(input.date, input.start, context.family.timezone);
  const endTime = dateTimeFromLocal(input.date, input.end, context.family.timezone);
  const [participantType, participantId] = (input.participantId || "").split(":");
  const userIds = [input.assignedUserId, input.chaperoneUserId, input.pickupUserId].filter((value): value is string => Boolean(value));
  await validateFamilyUsers(context.familyId, userIds);

  if (participantType === "kid" && participantId) {
    const kid = await prisma.kidProfile.findFirst({ where: { id: participantId, familyGroupId: context.familyId } });
    if (!kid) throw new Error("Il profilo del figlio selezionato non appartiene a questa famiglia.");
  } else if (participantType === "user" && participantId) {
    await validateFamilyUsers(context.familyId, [participantId]);
  } else if (input.participantId) {
    throw new Error("Il familiare selezionato non è valido.");
  }

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
    const kidOverlap = await prisma.event.findFirst({
      where: {
        familyGroupId: context.familyId,
        kidProfileId: participantId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });
    if (kidOverlap) status = EventStatus.CONFLICT;
  }

  const chaperoneUserId = input.chaperoneUserId || null;
  const pickupUserId = input.pickupUserId || null;
  for (const userId of [chaperoneUserId, pickupUserId]) {
    if (userId && await memberConflicts(context.familyId, userId, startTime, endTime)) status = EventStatus.CONFLICT;
  }

  await prisma.event.create({
    data: {
      familyGroupId: context.familyId,
      title: input.title,
      startTime,
      endTime,
      category: input.category,
      status,
      location: input.location || null,
      description: input.description || null,
      assignedUserId,
      chaperoneUserId,
      pickupUserId,
      kidProfileId: participantType === "kid" ? participantId : null,
    },
  });

  revalidatePath("/calendar");
  revalidatePath("/tasks");
  return { success: true, status, assignedUserId };
}

export async function updateEvent(formData: FormData) {
  const context = await requireAdmin();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Impegno non valido.");
  const event = await prisma.event.findFirst({ where: { id: id.data, familyGroupId: context.familyId } });
  if (!event) throw new Error("Impegno non trovato.");
  const input = parseEvent(formData);
  const startTime = dateTimeFromLocal(input.date, input.start, context.family.timezone);
  const endTime = dateTimeFromLocal(input.date, input.end, context.family.timezone);
  const [participantType, participantId] = (input.participantId || "").split(":");
  await validateFamilyUsers(context.familyId, [input.assignedUserId, input.chaperoneUserId, input.pickupUserId].filter((value): value is string => Boolean(value)));
  if (participantType === "kid" && participantId && !(await prisma.kidProfile.findFirst({ where: { id: participantId, familyGroupId: context.familyId } }))) {
    throw new Error("Il profilo del figlio selezionato non appartiene a questa famiglia.");
  }
  if (participantType === "user" && participantId) await validateFamilyUsers(context.familyId, [participantId]);
  if (input.participantId && !["kid", "user"].includes(participantType)) throw new Error("Il familiare selezionato non è valido.");

  const assignedUserId = input.assignedUserId || (participantType === "user" ? participantId : "") || null;
  let status: EventStatus = assignedUserId ? EventStatus.CONFIRMED : EventStatus.UNASSIGNED;
  for (const userId of [assignedUserId, input.chaperoneUserId, input.pickupUserId]) {
    if (userId && await memberConflicts(context.familyId, userId, startTime, endTime, event.id)) status = EventStatus.CONFLICT;
  }
  if (participantType === "kid" && participantId) {
    const conflict = await prisma.event.findFirst({
      where: { familyGroupId: context.familyId, id: { not: event.id }, kidProfileId: participantId, startTime: { lt: endTime }, endTime: { gt: startTime } },
      select: { id: true },
    });
    if (conflict) status = EventStatus.CONFLICT;
  }
  if (assignedUserId) {
    const membership = await prisma.familyMember.findFirst({
      where: { familyGroupId: context.familyId, userId: assignedUserId },
      select: { user: { select: { workSchedule: true } } },
    });
    if (membership && hasWorkScheduleConflict(membership.user.workSchedule, startTime, endTime, context.family.timezone)) {
      status = EventStatus.CONFLICT;
    }
  }

  await prisma.event.update({
    where: { id: event.id },
    data: {
      title: input.title,
      startTime,
      endTime,
      category: input.category,
      status,
      location: input.location || null,
      description: input.description || null,
      assignedUserId,
      chaperoneUserId: input.chaperoneUserId || null,
      pickupUserId: input.pickupUserId || null,
      kidProfileId: participantType === "kid" ? participantId : null,
    },
  });
  revalidatePath("/calendar");
}

export async function deleteEvent(formData: FormData) {
  const context = await requireAdmin();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Impegno non valido.");
  await prisma.event.deleteMany({ where: { id: id.data, familyGroupId: context.familyId } });
  revalidatePath("/calendar");
}

export async function moveEvent(formData: FormData) {
  const context = await requireAdmin();
  const id = z.string().min(1).safeParse(formData.get("id"));
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("date"));
  const start = z.string().regex(/^\d{2}:\d{2}$/).safeParse(formData.get("start"));
  if (!id.success || !date.success || !start.success) throw new Error("Spostamento non valido.");
  const event = await prisma.event.findFirst({ where: { id: id.data, familyGroupId: context.familyId } });
  if (!event) throw new Error("Impegno non trovato.");
  const duration = event.endTime.getTime() - event.startTime.getTime();
  const startTime = dateTimeFromLocal(date.data, start.data, context.family.timezone);
  const endTime = new Date(startTime.getTime() + duration);
  const assignedConflict = event.assignedUserId
    ? await prisma.event.findFirst({
        where: {
          familyGroupId: context.familyId,
          id: { not: event.id },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
          OR: [
            { assignedUserId: event.assignedUserId },
            { chaperoneUserId: event.assignedUserId },
            { pickupUserId: event.assignedUserId },
          ],
        },
        select: { id: true },
      })
    : null;
  const kidConflict = event.kidProfileId
    ? await prisma.event.findFirst({
        where: {
          familyGroupId: context.familyId,
          id: { not: event.id },
          kidProfileId: event.kidProfileId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      })
    : null;
  await prisma.event.update({
    where: { id: event.id },
    data: {
      startTime,
      endTime,
      status: assignedConflict || kidConflict ? EventStatus.CONFLICT : event.assignedUserId ? EventStatus.CONFIRMED : EventStatus.UNASSIGNED,
    },
  });
  revalidatePath("/calendar");
}
