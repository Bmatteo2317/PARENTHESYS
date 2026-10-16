import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, guard, json, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  familyGroupId: z.string().min(1).optional(),
  channels: z
    .object({ inApp: z.boolean().optional(), email: z.boolean().optional(), push: z.boolean().optional() })
    .optional(),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  digest: z.enum(["none", "daily", "weekly"]).optional(),
  onlyAssigned: z.boolean().optional(),
  onlyUrgent: z.boolean().optional(),
  grouped: z.boolean().optional(),
  pausedUntil: z.string().datetime().nullable().optional(),
});

// Le preferenze di notifica sono dell'individuo, non del nucleo: nessuno le modifica al posto suo.
export async function PATCH(request: NextRequest) {
  return guard(async () => {
    const userId = await requireUser();
    const input = parseBody(preferencesSchema, await readJson(request));

    const familyGroupId = input.familyGroupId
      ? (await resolveHousehold(userId, input.familyGroupId)).familyGroupId
      : await firstHousehold(userId);

    const [existing] = await db`
      SELECT "channels", "quietStart", "quietEnd", "digest", "onlyAssigned", "onlyUrgent", "grouped", "pausedUntil"
      FROM "NotificationPreference" WHERE "userId" = ${userId} AND "familyGroupId" = ${familyGroupId} LIMIT 1
    `;
    const currentChannels = (existing?.channels as Record<string, boolean> | undefined) ?? { inApp: true, email: false, push: false };
    const channels = { ...currentChannels, ...(input.channels ?? {}) };

    await db`
      INSERT INTO "NotificationPreference"
        ("id", "userId", "familyGroupId", "channels", "quietStart", "quietEnd", "digest", "onlyAssigned", "onlyUrgent", "grouped", "pausedUntil", "updatedAt")
      VALUES (
        gen_random_uuid()::text, ${userId}, ${familyGroupId}, ${JSON.stringify(channels)}::jsonb,
        ${input.quietStart !== undefined ? input.quietStart : (existing?.quietStart as string | null) ?? null},
        ${input.quietEnd !== undefined ? input.quietEnd : (existing?.quietEnd as string | null) ?? null},
        ${input.digest ?? (existing?.digest as string) ?? "none"},
        ${input.onlyAssigned ?? (existing?.onlyAssigned as boolean) ?? false},
        ${input.onlyUrgent ?? (existing?.onlyUrgent as boolean) ?? false},
        ${input.grouped ?? (existing?.grouped as boolean) ?? true},
        ${input.pausedUntil !== undefined ? input.pausedUntil : (existing?.pausedUntil as string | null) ?? null},
        NOW()
      )
      ON CONFLICT ("userId", "familyGroupId") DO UPDATE SET
        "channels" = EXCLUDED."channels", "quietStart" = EXCLUDED."quietStart", "quietEnd" = EXCLUDED."quietEnd",
        "digest" = EXCLUDED."digest", "onlyAssigned" = EXCLUDED."onlyAssigned", "onlyUrgent" = EXCLUDED."onlyUrgent",
        "grouped" = EXCLUDED."grouped", "pausedUntil" = EXCLUDED."pausedUntil", "updatedAt" = NOW()
    `;

    await writeAudit({ familyGroupId, actorUserId: userId, action: "preferences.update", entityType: "NotificationPreference" });

    const [saved] = await db`
      SELECT "channels", "quietStart", "quietEnd", "digest", "onlyAssigned", "onlyUrgent", "grouped", "pausedUntil", "updatedAt"
      FROM "NotificationPreference" WHERE "userId" = ${userId} AND "familyGroupId" = ${familyGroupId} LIMIT 1
    `;
    return json({ familyGroupId, preferences: saved });
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
