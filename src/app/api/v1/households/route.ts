import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { guard, idempotencyKey, idempotent, parseBody, readJson, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { Permission, HOUSEHOLD_TYPES, RoleKey } from "@/lib/domain";

export const dynamic = "force-dynamic";

const householdSchema = z.object({
  name: z.string().trim().min(2).max(80),
  roleName: z.string().trim().min(2).max(40).default("Referente del nucleo"),
  type: z.enum(HOUSEHOLD_TYPES.map((entry) => entry.value) as unknown as [string, ...string[]]).default("custom"),
  locale: z.string().trim().min(2).max(10).default("it-IT"),
  timezone: z.string().trim().min(2).max(60).default("Europe/Rome"),
  description: z.string().trim().max(400).optional(),
});

function inviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

// Chi crea il nucleo ne diventa referente: ruolo tecnico, non una gerarchia sulle persone.
export async function POST(request: NextRequest) {
  return guard(async () => {
    const userId = await requireUser();
    const input = parseBody(householdSchema, await readJson(request));

    return idempotent(userId, null, "POST /api/v1/households", idempotencyKey(request), async () => {
      const [family] = await db`
        WITH created AS (
          INSERT INTO "FamilyGroup" ("id", "name", "inviteCode", "type", "locale", "timezone", "description", "updatedAt")
          VALUES (gen_random_uuid()::text, ${input.name}, ${inviteCode()}, ${input.type}, ${input.locale}, ${input.timezone},
            ${input.description ?? null}, NOW())
          RETURNING "id", "name", "inviteCode", "type", "locale", "timezone", "createdAt"
        ),
        membership AS (
          INSERT INTO "FamilyMember" ("id", "userId", "familyGroupId", "roleName", "roleKey", "permission")
          SELECT gen_random_uuid()::text, ${userId}, created."id", ${input.roleName}, ${RoleKey.OWNER}, ${Permission.ADMIN}
          FROM created
        )
        SELECT * FROM created
      `;

      await writeAudit({
        familyGroupId: family.id as string,
        actorUserId: userId,
        action: "household.create",
        entityType: "FamilyGroup",
        entityId: family.id as string,
        afterValue: { name: input.name, type: input.type },
      });

      return { status: 201, data: { household: family, membership: { roleKey: RoleKey.OWNER, permission: Permission.ADMIN } } };
    });
  });
}
