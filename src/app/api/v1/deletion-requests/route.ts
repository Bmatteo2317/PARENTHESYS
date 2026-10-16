import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const deletionSchema = z.object({
  scope: z.enum(["personal", "account", "household"]).default("personal"),
  subjectType: z.enum(["account", "membership", "care_profile"]).default("account"),
  familyGroupId: z.string().min(1).optional(),
  reason: z.string().trim().max(400).optional(),
});

// La cancellazione è una richiesta tracciata: verificabile e con un esito, non una promessa vaga.
export async function POST(request: NextRequest) {
  return guard(async () => {
    const userId = await requireUser();
    const input = parseBody(deletionSchema, await readJson(request));

    const membership = await resolveHousehold(userId, input.familyGroupId ?? (await firstHousehold(userId)));
    if (input.scope === "household") assertCapability(membership, "data.delete");

    return idempotent(userId, membership.familyGroupId, "POST /api/v1/deletion-requests", idempotencyKey(request), async () => {
      const [created] = await db`
        INSERT INTO "DeletionRequest" ("id", "familyGroupId", "requestedById", "subjectType", "subjectId", "scope", "reason", "status")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${userId}, ${input.subjectType},
          ${input.subjectType === "account" ? userId : null}, ${input.scope}, ${input.reason ?? null}, 'pending')
        RETURNING "id", "scope", "status", "createdAt"
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "data.deletion.request",
        entityType: "DeletionRequest",
        entityId: created.id as string,
        reason: input.reason,
      });
      return { status: 201, data: created };
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
