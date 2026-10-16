"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit, writeAccessLog } from "@/lib/audit";

export type ExportResult = { id: string; filename: string; payload: unknown };

// L'esportazione restituisce alle persone i propri dati, in un formato leggibile e riutilizzabile.
export async function requestExport(formData: FormData): Promise<ExportResult> {
  const context = await getFamilyContext();
  const parsed = z
    .object({ scope: z.enum(["me", "household"]).default("me"), format: z.enum(["json"]).default("json") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Richiesta di esportazione non valida.");
  const scope = parsed.data.scope;
  if (scope === "household" && !context.capabilities.has("data.export")) {
    throw new Error("Serve il permesso di esportazione per scaricare i dati dell'intero nucleo.");
  }

  const personal = scope === "me";
  const [profile, memberships, events, tasks, checkIns, supportRequests, audit] = await Promise.all([
    db`SELECT "id", "name", "email", "locale", "timeZone", "avatarColor", "createdAt" FROM "User" WHERE "id" = ${context.userId} LIMIT 1`,
    db`
      SELECT fm."id", fm."roleKey", fm."roleName", fm."permission", fm."joinedAt", fg."name" AS "familyName"
      FROM "FamilyMember" fm JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
      WHERE fm."userId" = ${context.userId}
    `,
    db`
      SELECT "id", "title", "startTime", "endTime", "category", "status", "assignedUserId"
      FROM "Event" WHERE "familyGroupId" = ${context.familyId}
        AND (${!personal} OR "assignedUserId" = ${context.userId} OR "chaperoneUserId" = ${context.userId} OR "pickupUserId" = ${context.userId})
    `,
    db`
      SELECT "id", "title", "category", "activityStatus", "assignedToId", "dueAt", "estimatedMinutes"
      FROM "Task" WHERE "familyGroupId" = ${context.familyId} AND (${!personal} OR "assignedToId" = ${context.userId})
    `,
    db`
      SELECT "id", "capacity", "stress", "shareLevel", "recordedFor"
      FROM "CheckIn" WHERE "familyGroupId" = ${context.familyId} AND (${!personal} OR "userId" = ${context.userId})
    `,
    db`
      SELECT "id", "message", "reasonType", "status", "createdAt"
      FROM "SupportRequest" WHERE "familyGroupId" = ${context.familyId} AND (${!personal} OR "createdById" = ${context.userId})
    `,
    db`
      SELECT "id", "action", "entityType", "createdAt"
      FROM "AuditLog" WHERE "familyGroupId" = ${context.familyId} AND (${!personal} OR "actorUserId" = ${context.userId})
      ORDER BY "createdAt" DESC LIMIT 500
    `,
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    scope,
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
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${context.userId}, ${scope}, 'json', 'ready',
      ${JSON.stringify(payload)}::jsonb, NOW())
    RETURNING "id"
  `;
  await writeAudit({ familyGroupId: context.familyId, actorUserId: context.userId, action: "data.export", entityType: "ExportJob", entityId: job.id as string });
  await writeAccessLog(context.familyId, context.userId, "data.export", true);
  revalidatePath("/privacy");

  const stamp = new Date().toISOString().slice(0, 10);
  return { id: job.id as string, filename: `parenthesys-export-${scope}-${stamp}.json`, payload };
}

const deletionSchema = z.object({
  scope: z.enum(["personal", "account", "household"]).default("personal"),
  subjectType: z.enum(["account", "membership", "care_profile"]).default("account"),
  reason: z.string().trim().max(400).optional(),
});

// La cancellazione è una richiesta tracciata: verificabile e con un esito, non una promessa vaga.
export async function requestDeletion(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = deletionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Richiesta di cancellazione non valida.");
  const input = parsed.data;
  if (input.scope === "household" && !context.capabilities.has("data.delete")) {
    throw new Error("Serve il permesso di cancellazione per eliminare i dati dell'intero nucleo.");
  }

  const [created] = await db`
    INSERT INTO "DeletionRequest" ("id", "familyGroupId", "requestedById", "subjectType", "subjectId", "scope", "reason", "status")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${context.userId}, ${input.subjectType},
      ${input.subjectType === "account" ? context.userId : null}, ${input.scope}, ${input.reason ?? null}, 'pending')
    RETURNING "id"
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "data.deletion.request",
    entityType: "DeletionRequest",
    entityId: created.id as string,
    reason: input.reason,
  });
  revalidatePath("/privacy");
}

// Uscire dal nucleo è un diritto: la persona resta padrona della propria presenza.
export async function leaveNucleus(formData: FormData) {
  const context = await getFamilyContext();
  const parsed = z.string().trim().max(200).optional().safeParse(formData.get("reason") ?? undefined);
  await db`
    UPDATE "FamilyMember" SET "status" = 'left'
    WHERE "id" = ${context.membership.id} AND "familyGroupId" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "member.leave",
    entityType: "FamilyMember",
    entityId: context.membership.id,
    reason: parsed.success ? parsed.data : undefined,
  });
  revalidatePath("/", "layout");
  redirect("/onboarding");
}
