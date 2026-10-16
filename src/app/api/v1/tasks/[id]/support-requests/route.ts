import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notifyCoordinators } from "@/lib/notify";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(3).max(600),
  reasonType: z.enum(["need_help", "cannot_attend", "need_company", "need_equipment", "need_time"]).default("need_help"),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
});

// Chiedere aiuto rende visibile un bisogno: la richiesta è aperta e chiunque può raccoglierla.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const input = parseBody(bodySchema, await readJson(request));

    const [task] = await db`SELECT "id", "title", "familyGroupId" FROM "Task" WHERE "id" = ${id} LIMIT 1`;
    if (!task) throw new ApiError(404, "task_not_found", "Attività non trovata.");
    const membership = await resolveHousehold(userId, task.familyGroupId as string);

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/tasks/${id}/support-requests`, idempotencyKey(request), async () => {
      const [created] = await db`
        INSERT INTO "SupportRequest" ("id", "familyGroupId", "taskId", "createdById", "message", "reasonType", "windowStart", "windowEnd", "status")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${id}, ${userId}, ${input.message}, ${input.reasonType},
          ${input.windowStart ? new Date(input.windowStart) : null}, ${input.windowEnd ? new Date(input.windowEnd) : null}, 'open')
        RETURNING "id", "status", "reasonType", "createdAt"
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "support.request",
        entityType: "SupportRequest",
        entityId: created.id as string,
        afterValue: { reasonType: input.reasonType },
      });
      await notifyCoordinators(membership.familyGroupId, userId, {
        type: "support_request",
        priority: "high",
        title: "Una richiesta di aiuto è aperta",
        body: input.message,
        entityType: "SupportRequest",
        entityId: created.id as string,
      });
      return { status: 201, data: created };
    });
  });
}
