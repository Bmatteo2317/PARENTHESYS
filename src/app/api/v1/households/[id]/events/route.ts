import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { dateTimeFromLocal, isCalendarDate } from "@/lib/datetime";
import { Category, EventStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().refine(isCalendarDate),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  category: z.enum(["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE", "CARE", "ERRANDS", "ADMIN", "COMMUNITY"]),
  participantId: z.string().min(1).optional(),
  assignedUserId: z.string().min(1).optional(),
  chaperoneUserId: z.string().min(1).optional(),
  pickupUserId: z.string().min(1).optional(),
  location: z.string().trim().max(180).optional(),
  description: z.string().trim().max(1000).optional(),
  preparationMinutes: z.number().int().min(0).max(240).default(0),
  travelMinutes: z.number().int().min(0).max(240).default(0),
  requiresBooking: z.boolean().default(false),
});

// Creare un evento è un'azione condivisa: serve il permesso di scrittura sul calendario.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);
    assertCapability(membership, "event.create");
    const input = parseBody(eventSchema, await readJson(request));
    if (input.end <= input.start) throw new ApiError(422, "validation_error", "L'orario di fine deve essere successivo all'inizio.");

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/households/${id}/events`, idempotencyKey(request), async () => {
      const people = [input.assignedUserId, input.chaperoneUserId, input.pickupUserId].filter(Boolean) as string[];
      if (people.length) {
        const members = await db`SELECT "userId" FROM "FamilyMember" WHERE "familyGroupId" = ${membership.familyGroupId} AND "status" = 'active'`;
        const valid = new Set(members.map((row) => row.userId as string));
        if (people.some((person) => !valid.has(person))) {
          throw new ApiError(422, "validation_error", "Una persona indicata non fa parte di questo nucleo.");
        }
      }
      if (input.participantId) {
        const [profile] = await db`
          SELECT "id" FROM "KidProfile" WHERE "id" = ${input.participantId} AND "familyGroupId" = ${membership.familyGroupId} LIMIT 1
        `;
        if (!profile) throw new ApiError(422, "validation_error", "Il profilo assistito indicato non appartiene a questo nucleo.");
      }

      const start = dateTimeFromLocal(input.date, input.start, membership.family.timezone);
      const end = dateTimeFromLocal(input.date, input.end, membership.family.timezone);

      const [created] = await db`
        INSERT INTO "Event" (
          "id", "familyGroupId", "title", "description", "location", "startTime", "endTime", "category", "status",
          "assignedUserId", "chaperoneUserId", "pickupUserId", "kidProfileId", "preparationMinutes", "travelMinutes",
          "requiresBooking", "visibility", "createdById", "updatedAt"
        )
        VALUES (
          gen_random_uuid()::text, ${membership.familyGroupId}, ${input.title}, ${input.description ?? null}, ${input.location ?? null},
          ${start}, ${end}, ${input.category as Category}, ${input.assignedUserId ? EventStatus.CONFIRMED : EventStatus.UNASSIGNED},
          ${input.assignedUserId ?? null}, ${input.chaperoneUserId ?? null}, ${input.pickupUserId ?? null}, ${input.participantId ?? null},
          ${input.preparationMinutes}, ${input.travelMinutes}, ${input.requiresBooking}, 'household', ${userId}, NOW()
        )
        RETURNING "id", "title", "startTime", "endTime", "category", "status", "assignedUserId"
      `;

      // I conflitti non bloccano: vengono mostrati, non imposti.
      const conflicts = people.length
        ? await db`
            SELECT "id", "title", "startTime", "endTime" FROM "Event"
            WHERE "familyGroupId" = ${membership.familyGroupId} AND "id" <> ${created.id as string}
              AND "startTime" < ${end} AND "endTime" > ${start}
              AND ("assignedUserId" = ANY(${people}::text[]) OR "chaperoneUserId" = ANY(${people}::text[]) OR "pickupUserId" = ANY(${people}::text[]))
          `
        : [];

      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "event.create",
        entityType: "Event",
        entityId: created.id as string,
        afterValue: { title: input.title, category: input.category },
      });

      return { status: 201, data: { event: created, conflicts } };
    });
  });
}
