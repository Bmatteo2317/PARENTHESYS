import { NextRequest } from "next/server";
import { ApiError, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import { Permission, RoleKey } from "@/lib/domain";

export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  roleName: z.string().trim().min(2).max(40).optional(),
});

// Accettare un invito dichiara il proprio ruolo: nessuno entra con permessi impliciti non annunciati.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { token } = await context.params;
    const input = parseBody(acceptSchema, await readJson(request).catch(() => ({})));

    const [invitation] = await db`
      SELECT "id", "familyGroupId", "roleKey", "permission", "careProfileId", "maxUses", "uses", "expiresAt", "revokedAt"
      FROM "Invitation" WHERE "token" = ${token} LIMIT 1
    `;
    if (!invitation || invitation.revokedAt) throw new ApiError(404, "invitation_not_found", "Invito non trovato o revocato.");
    if (new Date(invitation.expiresAt as string) < new Date()) throw new ApiError(410, "invitation_expired", "Questo invito è scaduto.");
    if ((invitation.uses as number) >= (invitation.maxUses as number)) throw new ApiError(410, "invitation_exhausted", "Questo invito è già stato utilizzato.");

    const familyGroupId = invitation.familyGroupId as string;

    return idempotent(userId, familyGroupId, `POST /api/v1/invitations/${token}/accept`, idempotencyKey(request), async () => {
      const [existing] = await db`
        SELECT "id" FROM "FamilyMember" WHERE "userId" = ${userId} AND "familyGroupId" = ${familyGroupId} LIMIT 1
      `;
      if (existing) return { status: 200, data: { familyGroupId, membershipId: existing.id as string, alreadyMember: true } };

      const [member] = await db`
        INSERT INTO "FamilyMember" ("id", "userId", "familyGroupId", "roleName", "roleKey", "permission", "kidProfileId")
        VALUES (gen_random_uuid()::text, ${userId}, ${familyGroupId},
          ${input.roleName ?? (invitation.roleKey as string)}, ${invitation.roleKey as RoleKey},
          ${invitation.permission as Permission}, ${(invitation.careProfileId as string | null) ?? null})
        RETURNING "id"
      `;
      await db`
        UPDATE "Invitation" SET "uses" = "uses" + 1, "acceptedByUserId" = ${userId}, "acceptedAt" = NOW()
        WHERE "id" = ${invitation.id as string}
      `;
      await writeAudit({
        familyGroupId,
        actorUserId: userId,
        action: "invitation.accept",
        entityType: "Invitation",
        entityId: invitation.id as string,
      });

      return { status: 201, data: { familyGroupId, membershipId: member.id as string } };
    });
  });
}
