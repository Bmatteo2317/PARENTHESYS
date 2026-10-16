import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAccessLog, writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  scope: z.enum(["me", "household"]).default("me"),
  familyGroupId: z.string().min(1).optional(),
  format: z.enum(["json"]).default("json"),
});

// L'esportazione restituisce alle persone i propri dati, in un formato leggibile e riutilizzabile.
export async function POST(request: NextRequest) {
  return guard(async () => {
    const userId = await requireUser();
    const input = parseBody(exportSchema, await readJson(request));

    const membership = await resolveHousehold(userId, input.familyGroupId ?? (await firstHousehold(userId)));
    if (input.scope === "household") assertCapability(membership, "data.export");

    return idempotent(userId, membership.familyGroupId, "POST /api/v1/exports", idempotencyKey(request), async () => {
      const personal = input.scope === "me";
      const [profile, memberships, events, tasks, checkIns, supportRequests, audit] = await Promise.all([
        db`SELECT "id", "name", "email", "locale", "timeZone", "avatarColor", "createdAt" FROM "User" WHERE "id" = ${userId} LIMIT 1`,
        db`
          SELECT fm."id", fm."roleKey", fm."roleName", fm."permission", fm."joinedAt", fg."name" AS "familyName"
          FROM "FamilyMember" fm JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
          WHERE fm."userId" = ${userId}
        `,
        db`
          SELECT "id", "title", "startTime", "endTime", "category", "status", "assignedUserId"
          FROM "Event" WHERE "familyGroupId" = ${membership.familyGroupId}
            AND (${!personal} OR "assignedUserId" = ${userId} OR "chaperoneUserId" = ${userId} OR "pickupUserId" = ${userId})
        `,
        db`
          SELECT "id", "title", "category", "activityStatus", "assignedToId", "dueAt", "estimatedMinutes"
          FROM "Task" WHERE "familyGroupId" = ${membership.familyGroupId} AND (${!personal} OR "assignedToId" = ${userId})
        `,
        db`
          SELECT "id", "capacity", "stress", "shareLevel", "recordedFor"
          FROM "CheckIn" WHERE "familyGroupId" = ${membership.familyGroupId} AND (${!personal} OR "userId" = ${userId})
        `,
        db`
          SELECT "id", "message", "reasonType", "status", "createdAt"
          FROM "SupportRequest" WHERE "familyGroupId" = ${membership.familyGroupId} AND (${!personal} OR "createdById" = ${userId})
        `,
        db`
          SELECT "id", "action", "entityType", "createdAt"
          FROM "AuditLog" WHERE "familyGroupId" = ${membership.familyGroupId} AND (${!personal} OR "actorUserId" = ${userId})
          ORDER BY "createdAt" DESC LIMIT 500
        `,
      ]);

      const payload = {
        generatedAt: new Date().toISOString(),
        scope: input.scope,
        format: "json",
        profile: profile[0] ?? null,
        memberships,
        events,
        tasks,
        checkIns,
        supportRequests,
        audit,
      };

      const [job] = await db`
        INSERT INTO "ExportJob" ("id", "familyGroupId", "requestedById", "scope", "format", "status", "payload", "completedAt")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${userId}, ${input.scope}, 'json', 'ready',
          ${JSON.stringify(payload)}::jsonb, NOW())
        RETURNING "id"
      `;
      await writeAudit({ familyGroupId: membership.familyGroupId, actorUserId: userId, action: "data.export", entityType: "ExportJob", entityId: job.id as string });
      await writeAccessLog(membership.familyGroupId, userId, "data.export", true);

      const stamp = new Date().toISOString().slice(0, 10);
      return {
        status: 201,
        data: { exportId: job.id as string, filename: `parenthesys-export-${input.scope}-${stamp}.json`, payload },
      };
    });
  });
}

async function firstHousehold(userId: string): Promise<string> {
  const [row] = await db`
    SELECT "familyGroupId" FROM "FamilyMember"
    WHERE "userId" = ${userId} AND "status" = 'active' ORDER BY "joinedAt" ASC LIMIT 1
  `;
  if (!row) throw new ApiError(404, "no_household", "Non fai parte di nessun nucleo attivo.");
  return row.familyGroupId as string;
}
