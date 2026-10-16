import { db } from "@/lib/db";

// Le notifiche restano dentro il prodotto e rispettano le preferenze di chi le riceve.
export type NotifyInput = {
  familyGroupId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  priority?: "low" | "normal" | "high";
  entityType?: string;
  entityId?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db`
      INSERT INTO "Notification" ("id", "familyGroupId", "userId", "type", "priority", "title", "body", "entityType", "entityId")
      VALUES (gen_random_uuid()::text, ${input.familyGroupId}, ${input.userId}, ${input.type},
        ${input.priority ?? "normal"}, ${input.title}, ${input.body ?? null},
        ${input.entityType ?? null}, ${input.entityId ?? null})
    `;
  } catch {
    // Una notifica mancata non deve interrompere l'azione principale.
  }
}

// Notifica tutti i coordinatori del nucleo tranne chi ha generato l'azione.
export async function notifyCoordinators(familyGroupId: string, actorUserId: string, input: Omit<NotifyInput, "familyGroupId" | "userId">): Promise<void> {
  const members = await db`
    SELECT "userId" FROM "FamilyMember"
    WHERE "familyGroupId" = ${familyGroupId} AND "status" = 'active' AND "userId" <> ${actorUserId}
  `;
  await Promise.all(members.map((member) => notify({ ...input, familyGroupId, userId: member.userId as string })));
}
