import { NextRequest } from "next/server";
import { ApiError, guard, idempotencyKey, idempotent, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notifyCoordinators } from "@/lib/notify";
import { ActivityStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

// Accettare è una conferma piena: chi accetta si prende la responsabilità, non solo il compito.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;

    const [task] = await db`SELECT "id", "title", "familyGroupId", "assignedToId" FROM "Task" WHERE "id" = ${id} LIMIT 1`;
    if (!task) throw new ApiError(404, "task_not_found", "Attività non trovata.");
    const membership = await resolveHousehold(userId, task.familyGroupId as string);
    if (task.assignedToId !== userId && !membership.isAdmin) {
      throw new ApiError(403, "forbidden", "Puoi rispondere solo alle attività assegnate a te.");
    }

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/tasks/${id}/accept`, idempotencyKey(request), async () => {
      await db`
        UPDATE "Task" SET "activityStatus" = ${ActivityStatus.ACCEPTED}, "updatedAt" = NOW()
        WHERE "id" = ${id} AND "familyGroupId" = ${membership.familyGroupId}
      `;
      await db`
        UPDATE "TaskAssignment" SET "status" = 'accepted', "respondedAt" = NOW()
        WHERE "taskId" = ${id} AND "userId" = ${userId}
          AND "id" = (SELECT "id" FROM "TaskAssignment" WHERE "taskId" = ${id} AND "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT 1)
      `;
      await db`
        INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "toStatus", "actorUserId")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${id}, 'accept', ${ActivityStatus.ACCEPTED}, ${userId})
      `;
      await writeAudit({ familyGroupId: membership.familyGroupId, actorUserId: userId, action: "activity.accept", entityType: "Task", entityId: id });
      await notifyCoordinators(membership.familyGroupId, userId, {
        type: "accept",
        title: `"${task.title as string}" è stata accettata`,
        entityType: "Task",
        entityId: id,
      });
      return { status: 200, data: { taskId: id, status: ActivityStatus.ACCEPTED } };
    });
  });
}
