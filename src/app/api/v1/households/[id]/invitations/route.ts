import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError, assertCapability, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ROLE_META, RoleKey } from "@/lib/domain";

export const dynamic = "force-dynamic";

const roleKeys = Object.keys(ROLE_META) as [RoleKey, ...RoleKey[]];

const inviteSchema = z.object({
  roleKey: z.enum(roleKeys),
  permission: z.enum(["ADMIN", "HELPER", "MEMBER"]).default("MEMBER"),
  label: z.string().trim().max(80).optional(),
  careProfileId: z.string().min(1).optional(),
  maxUses: z.number().int().min(1).max(20).default(1),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

// L'invito dichiara in anticipo ruolo e accesso: chi entra sa già cosa potrà fare e vedere.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);
    assertCapability(membership, "invite.manage");
    const input = parseBody(inviteSchema, await readJson(request));

    if (input.careProfileId) {
      const [profile] = await db`
        SELECT "id" FROM "KidProfile" WHERE "id" = ${input.careProfileId} AND "familyGroupId" = ${membership.familyGroupId} LIMIT 1
      `;
      if (!profile) throw new ApiError(422, "validation_error", "Il profilo assistito scelto non appartiene a questo nucleo.");
    }

    return idempotent(userId, membership.familyGroupId, `POST /api/v1/households/${id}/invitations`, idempotencyKey(request), async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

      const [created] = await db`
        INSERT INTO "Invitation" ("id", "familyGroupId", "token", "shortCode", "roleKey", "permission", "careProfileId", "createdById", "label", "maxUses", "expiresAt")
        VALUES (gen_random_uuid()::text, ${membership.familyGroupId}, ${randomBytes(24).toString("base64url")}, ${randomBytes(5).toString("hex").toUpperCase()},
          ${input.roleKey}, ${input.permission}, ${input.careProfileId ?? null}, ${userId}, ${input.label ?? null}, ${input.maxUses}, ${expiresAt})
        RETURNING "id", "token", "shortCode", "roleKey", "permission", "maxUses", "expiresAt"
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "invitation.create",
        entityType: "Invitation",
        entityId: created.id as string,
        afterValue: { roleKey: input.roleKey, maxUses: input.maxUses },
      });
      return { status: 201, data: created };
    });
  });
}
