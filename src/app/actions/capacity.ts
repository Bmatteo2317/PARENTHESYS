"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const checkInSchema = z.object({
  capacity: z.enum(["high", "normal", "reduced", "protected", "unavailable"]),
  stress: z.coerce.number().int().min(0).max(5).optional(),
  energy: z.coerce.number().int().min(0).max(5).optional(),
  sleep: z.coerce.number().int().min(0).max(5).optional(),
  mood: z.coerce.number().int().min(0).max(5).optional(),
  needPause: z.enum(["true", "false"]).optional(),
  note: z.string().trim().max(400).optional(),
  shareLevel: z.enum(["private", "band", "detail"]).default("band"),
});

// Il check-in è volontario e revocabile. Serve a chiedere aiuto, non a sorvegliare.
export async function submitCheckIn(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = checkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Il check-in non è valido.");
  const input = parsed.data;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Un solo check-in al giorno: quello nuovo sostituisce il precedente, senza storico nascosto.
  await db`
    DELETE FROM "CheckIn"
    WHERE "familyGroupId" = ${context.familyId} AND "userId" = ${context.userId}
      AND "kind" = 'daily' AND "recordedFor" = ${today}
  `;
  await db`
    INSERT INTO "CheckIn" (
      "id", "familyGroupId", "userId", "kind", "capacity", "stress", "energy", "sleep", "mood",
      "needPause", "note", "shareLevel", "recordedFor"
    )
    VALUES (
      gen_random_uuid()::text, ${context.familyId}, ${context.userId}, 'daily', ${input.capacity},
      ${input.stress ?? null}, ${input.energy ?? null}, ${input.sleep ?? null}, ${input.mood ?? null},
      ${input.needPause === "true"}, ${input.note ?? null}, ${input.shareLevel}, ${today}
    )
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "checkin.create",
    entityType: "CheckIn",
    afterValue: { capacity: input.capacity, shareLevel: input.shareLevel },
  });

  revalidatePath("/careboard");
  revalidatePath("/workload");
  revalidatePath("/family");
}

export async function clearCheckIn() {
  const context = await getFamilyContext();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await db`
    DELETE FROM "CheckIn"
    WHERE "familyGroupId" = ${context.familyId} AND "userId" = ${context.userId}
      AND "kind" = 'daily' AND "recordedFor" = ${today}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "checkin.clear",
    entityType: "CheckIn",
  });
  revalidatePath("/careboard");
  revalidatePath("/workload");
  revalidatePath("/family");
}
