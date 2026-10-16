import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ActivityStatus, Category, Flexibility, TaskStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const taskSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(600).optional(),
  category: z.enum(["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE", "CARE", "ERRANDS", "ADMIN", "COMMUNITY"]),
  estimatedMinutes: z.number().int().min(0).max(1440).default(30),
  preparationMinutes: z.number().int().min(0).max(240).default(0),
  travelMinutes: z.number().int().min(0).max(240).default(0),
  coordinationMinutes: z.number().int().min(0).max(240).default(0),
  mentalLoad: z.number().int().min(1).max(5).default(1),
  physicalLoad: z.number().int().min(1).max(5).default(1),
  emotionalLoad: z.number().int().min(1).max(5).default(1),
  urgency: z.number().int().min(1).max(5).default(1),
  predictability: z.number().int().min(1).max(5).default(1),
  flexibility: z.enum(["fixed", "semi_flexible", "flexible"]).default("flexible"),
  rotates: z.boolean().default(false),
  dueAt: z.string().datetime().optional(),
  careProfileId: z.string().min(1).optional(),
});

// Un'attività descrive il lavoro che serve davvero: tempo operativo, cura, coordinamento e carico mentale.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);
    assertCapability(membership, "event.create");
    const input = parseBody(taskSchema, await readJson(request));

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/households/${id}/tasks`, idempotencyKey(request), async () => {
      if (input.careProfileId) {
        const [profile] = await db`
          SELECT "id" FROM "KidProfile" WHERE "id" = ${input.careProfileId} AND "familyGroupId" = ${membership.familyGroupId} LIMIT 1
        `;
        if (!profile) throw new ApiError(422, "validation_error", "La persona assistita indicata non appartiene a questo nucleo.");
      }

      const dueAt = input.dueAt ? new Date(input.dueAt) : null;

      const [created] = await db`
        INSERT INTO "Task" (
          "id", "familyGroupId", "title", "description", "status", "assignedToId", "dueDate", "dueAt", "points",
          "activityStatus", "category", "estimatedMinutes", "preparationMinutes", "travelMinutes", "coordinationMinutes",
          "mentalLoad", "physicalLoad", "emotionalLoad", "urgency", "predictability", "flexibility", "rotates",
          "careProfileId", "visibility", "createdById", "updatedAt"
        )
        VALUES (
          gen_random_uuid()::text, ${membership.familyGroupId}, ${input.title}, ${input.description ?? null}, ${TaskStatus.PENDING},
          ${null}, ${dueAt ?? new Date()}, ${dueAt}, 0, ${ActivityStatus.UNASSIGNED}, ${input.category as Category},
          ${input.estimatedMinutes}, ${input.preparationMinutes}, ${input.travelMinutes}, ${input.coordinationMinutes},
          ${input.mentalLoad}, ${input.physicalLoad}, ${input.emotionalLoad}, ${input.urgency}, ${input.predictability},
          ${input.flexibility as Flexibility}, ${input.rotates}, ${input.careProfileId ?? null}, 'household', ${userId}, NOW()
        )
        RETURNING "id", "title", "category", "activityStatus", "dueAt", "estimatedMinutes"
      `;

      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "activity.create",
        entityType: "Task",
        entityId: created.id as string,
        afterValue: { title: input.title, category: input.category, estimatedMinutes: input.estimatedMinutes },
      });

      return { status: 201, data: created };
    });
  });
}
