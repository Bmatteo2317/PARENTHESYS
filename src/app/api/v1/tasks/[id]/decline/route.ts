import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notifyCoordinators } from "@/lib/notify";
import { ActivityStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ message: z.string().trim().max(400).optional() });

// Declinare non è un rifiuto morale: è un segnale che il nucleo deve risolvere insieme.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const input = parseBody(bodySchema, await readJson(request).catch(() => ({})));

    const [task] = await db`SELECT "id", "title", "familyGroupId", "assignedToId" FROM "Task" WHERE "id" = ${id} LIMIT 1`;
    if (!task) throw new ApiError(404, "task_not_found", "Attività non trovata.");
    const membership = await resolveHousehold(userId, task.familyGroupId as string);
    if (task.assignedToId !== userId && !membership.isAdmin) {
      throw new ApiError(403, "forbidden", "Puoi rispondere solo alle attività assegnate a te.");
    }

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/tasks/${id}/decline`, idempotencyKey(request), async () => {
      await db`
        UPDATE "Task" SET "activityStatus" = ${ActivityStatus.DECLINED}, "updatedAt" = NOW()
        WHERE "id" = ${id} AND "familyGroupId" = ${membership.familyGroupId}
      `;
      await db`
        UPDATE "TaskAssignment" SET "status" = 'declined', "respondedAt" = NOW()
        WHERE "taskId" = ${id} AND "userId" = ${userId}
          AND "id" = (SELECT "id" FROM "TaskAssignment" WHERE "taskId" = ${id} AND "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT 1)
      `;
      await db`
        INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "toStatus", "note", "actorUserId")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${id}, 'decline', ${ActivityStatus.DECLINED}, ${input.message ?? null}, ${userId})
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "activity.decline",
        entityType: "Task",
        entityId: id,
        reason: input.message,
      });
      await notifyCoordinators(membership.familyGroupId, userId, {
        type: "decline",
        priority: "high",
        title: `"${task.title as string}" è stata declinata`,
        body: input.message ?? "Qualcuno ha segnalato di non poter coprire questa attività. Serve una nuova proposta.",
        entityType: "Task",
        entityId: id,
      });
      return { status: 200, data: { taskId: id, status: ActivityStatus.DECLINED } };
    });
  });
}
