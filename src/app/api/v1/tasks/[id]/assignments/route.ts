import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { ActivityStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const assignmentSchema = z.object({
  assigneeId: z.string().min(1),
  source: z.enum(["manual", "equity", "rotation", "ai"]).default("manual"),
  explanation: z.string().trim().max(400).optional(),
});

// Assegnare è una proposta, non un ordine: la persona può accettare, chiedere supporto o declinare.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const input = parseBody(assignmentSchema, await readJson(request));

    const [task] = await db`
      SELECT "id", "title", "familyGroupId", "assignedToId", "activityStatus" FROM "Task" WHERE "id" = ${id} LIMIT 1
    `;
    if (!task) throw new ApiError(404, "task_not_found", "Attività non trovata.");
    const membership = await resolveHousehold(userId, task.familyGroupId as string);
    assertCapability(membership, "task.assign");

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/tasks/${id}/assignments`, idempotencyKey(request), async () => {
      const [member] = await db`
        SELECT "id" FROM "FamilyMember"
        WHERE "userId" = ${input.assigneeId} AND "familyGroupId" = ${membership.familyGroupId} AND "status" = 'active' LIMIT 1
      `;
      if (!member) throw new ApiError(422, "validation_error", "La persona scelta non fa parte di questo nucleo.");

      await db`
        UPDATE "Task" SET "assignedToId" = ${input.assigneeId}, "activityStatus" = ${ActivityStatus.ASSIGNED}, "updatedAt" = NOW()
        WHERE "id" = ${id} AND "familyGroupId" = ${membership.familyGroupId}
      `;
      await db`
        INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "status", "source", "explanation", "createdById")
        VALUES (gen_random_uuid()::text, ${id}, ${input.assigneeId}, 'primary', 'proposed', ${input.source}, ${input.explanation ?? null}, ${userId})
      `;
      await db`
        INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "fromStatus", "toStatus", "actorUserId")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${id}, 'assignment', ${(task.assignedToId as string | null) ?? null},
          ${input.assigneeId}, ${(task.activityStatus as string | null) ?? null}, ${ActivityStatus.ASSIGNED}, ${userId})
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "activity.assign",
        entityType: "Task",
        entityId: id,
        beforeValue: { assignedToId: task.assignedToId },
        afterValue: { assignedToId: input.assigneeId, source: input.source },
      });
      await notify({
        familyGroupId: membership.familyGroupId,
        userId: input.assigneeId,
        type: "assignment",
        priority: "normal",
        title: `Ti è stata proposta "${task.title as string}"`,
        body: input.explanation ?? "Puoi accettare, chiedere supporto o declinare con una nota.",
        entityType: "Task",
        entityId: id,
      });

      return { status: 201, data: { taskId: id, assigneeId: input.assigneeId, status: ActivityStatus.ASSIGNED } };
    });
  });
}
