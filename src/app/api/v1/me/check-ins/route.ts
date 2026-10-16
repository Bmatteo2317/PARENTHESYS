import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, guard, idempotencyKey, idempotent, parseBody, readJson, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const checkInSchema = z.object({
  familyGroupId: z.string().min(1).optional(),
  capacity: z.enum(["high", "normal", "reduced", "protected", "unavailable"]),
  stress: z.number().int().min(0).max(5).optional(),
  energy: z.number().int().min(0).max(5).optional(),
  sleep: z.number().int().min(0).max(5).optional(),
  mood: z.number().int().min(0).max(5).optional(),
  needPause: z.boolean().optional(),
  note: z.string().trim().max(400).optional(),
  shareLevel: z.enum(["private", "band", "detail"]).default("band"),
});

// Il check-in è volontario e revocabile: dichiara come si sta, non cosa si deve fare.
export async function POST(request: NextRequest) {
  return guard(async () => {
    const userId = await requireUser();
    const input = parseBody(checkInSchema, await readJson(request));

    const membership = await resolveHousehold(userId, input.familyGroupId ?? (await firstHousehold(userId)));

    return idempotent(userId, membership.familyGroupId, "POST /api/v1/me/check-ins", idempotencyKey(request), async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Un solo check-in al giorno: il nuovo sostituisce il precedente, senza storico nascosto.
      await db`
        DELETE FROM "CheckIn"
        WHERE "familyGroupId" = ${membership.familyGroupId} AND "userId" = ${userId}
          AND "kind" = 'daily' AND "recordedFor" = ${today}
      `;
      const [created] = await db`
        INSERT INTO "CheckIn" (
          "id", "familyGroupId", "userId", "kind", "capacity", "stress", "energy", "sleep", "mood",
          "needPause", "note", "shareLevel", "recordedFor"
        )
        VALUES (
          gen_random_uuid()::text, ${membership.familyGroupId}, ${userId}, 'daily', ${input.capacity},
          ${input.stress ?? null}, ${input.energy ?? null}, ${input.sleep ?? null}, ${input.mood ?? null},
          ${input.needPause ?? false}, ${input.note ?? null}, ${input.shareLevel}, ${today}
        )
        RETURNING "id", "capacity", "stress", "shareLevel", "recordedFor"
      `;
      await writeAudit({
        familyGroupId: membership.familyGroupId,
        actorUserId: userId,
        action: "checkin.create",
        entityType: "CheckIn",
        entityId: created.id as string,
        afterValue: { capacity: input.capacity, shareLevel: input.shareLevel },
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
