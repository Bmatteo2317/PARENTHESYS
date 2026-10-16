import { db } from "@/lib/db";

export type AuditEntry = {
  familyGroupId: string | null;
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
  sessionRef?: string;
};

// Le modifiche importanti sono tracciabili: autore, data, dispositivo, valore precedente e nuovo.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db`
    INSERT INTO "AuditLog" ("id", "familyGroupId", "actorUserId", "action", "entityType", "entityId", "beforeValue", "afterValue", "reason", "sessionRef")
    VALUES (
      gen_random_uuid()::text, ${entry.familyGroupId}, ${entry.actorUserId}, ${entry.action},
      ${entry.entityType ?? null}, ${entry.entityId ?? null},
      ${entry.beforeValue ? JSON.stringify(entry.beforeValue) : null}::jsonb,
      ${entry.afterValue ? JSON.stringify(entry.afterValue) : null}::jsonb,
      ${entry.reason ?? null}, ${entry.sessionRef ?? null}
    )
  `;
}

export async function writeAccessLog(familyGroupId: string | null, userId: string | null, action: string, sensitive = false): Promise<void> {
  await db`
    INSERT INTO "AccessLog" ("id", "familyGroupId", "userId", "action", "sensitive")
    VALUES (gen_random_uuid()::text, ${familyGroupId}, ${userId}, ${action}, ${sensitive})
  `;
}
