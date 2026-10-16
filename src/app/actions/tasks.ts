"use server";

import { Permission, TaskStatus } from "@/lib/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getFamilyContext, requireFamilyCoordinator } from "@/lib/family";
import { db } from "@/lib/db";
import { isCalendarDate } from "@/lib/datetime";

export async function createTask(formData: FormData) {
  const context = await requireFamilyCoordinator();
  const title = z.string().trim().min(2).max(120).safeParse(formData.get("title"));
  const dueDate = z.string().refine(isCalendarDate).safeParse(formData.get("dueDate"));
  const assignedToId = z.string().min(1).safeParse(formData.get("assignedToId"));
  const points = z.coerce.number().int().min(0).max(100).safeParse(formData.get("points"));
  if (!title.success || !dueDate.success || !assignedToId.success || !points.success) throw new Error("Controlla i dati dell’attività.");
  const [member] = await db`
    SELECT "id" FROM "FamilyMember" WHERE "userId" = ${assignedToId.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!member) {
    throw new Error("La persona scelta non appartiene a questa famiglia.");
  }
  await db`
    INSERT INTO "Task" ("id", "familyGroupId", "title", "assignedToId", "createdById", "dueDate", "points", "updatedAt")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${title.data}, ${assignedToId.data},
      ${context.userId}, ${new Date(`${dueDate.data}T12:00:00Z`)}, ${points.data}, NOW())
  `;
  revalidatePath("/tasks");
}

export async function toggleTask(formData: FormData) {
  const context = await getFamilyContext();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Attività non valida.");
  const [task] = await db`
    SELECT "id", "assignedToId", "status" FROM "Task"
    WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!task) throw new Error("Attività non trovata.");
  if (context.membership.permission === Permission.MEMBER && task.assignedToId !== context.userId) {
    throw new Error("Puoi completare solo le attività assegnate a te.");
  }
  const completed = task.status === TaskStatus.COMPLETED;
  await db`
    UPDATE "Task" SET "status" = ${completed ? TaskStatus.PENDING : TaskStatus.COMPLETED},
      "completedAt" = ${completed ? null : new Date()}, "updatedAt" = NOW()
    WHERE "id" = ${task.id} AND "familyGroupId" = ${context.familyId}
  `;
  revalidatePath("/tasks");
}

export async function createSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const title = z.string().trim().min(3).max(120).safeParse(formData.get("title"));
  const date = z.string().refine(isCalendarDate, "Inserisci una data valida.").safeParse(formData.get("neededBy"));
  const description = z.string().trim().max(500).optional().safeParse(formData.get("description") || undefined);
  if (!title.success || !date.success || !description.success) {
    throw new Error("Controlla titolo, data e dettagli della richiesta.");
  }

  await db`
    INSERT INTO "SupportRequest" (
      "id", "familyGroupId", "createdById", "title", "description", "neededBy", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${context.familyId}, ${context.userId}, ${title.data},
      ${description.data || null}, ${date.data}, NOW()
    )
  `;
  revalidatePath("/tasks");
}

export async function claimSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Richiesta di aiuto non valida.");

  const [request] = await db`
    UPDATE "SupportRequest"
    SET "status" = 'CLAIMED', "claimedById" = ${context.userId}, "claimedAt" = NOW(), "updatedAt" = NOW()
    WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId}
      AND "status" = 'OPEN' AND "createdById" <> ${context.userId}
    RETURNING "id"
  `;
  if (!request) throw new Error("La richiesta è stata già presa in carico o non è più disponibile.");
  revalidatePath("/tasks");
}

export async function releaseSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Richiesta di aiuto non valida.");

  const [request] = await db`
    UPDATE "SupportRequest"
    SET "status" = 'OPEN', "claimedById" = NULL, "claimedAt" = NULL, "updatedAt" = NOW()
    WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId}
      AND "claimedById" = ${context.userId} AND "status" = 'CLAIMED'
    RETURNING "id"
  `;
  if (!request) throw new Error("Non puoi modificare una richiesta presa in carico da un’altra persona.");
  revalidatePath("/tasks");
}

export async function cancelSupportRequest(formData: FormData) {
  const context = await getFamilyContext();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Richiesta di aiuto non valida.");

  const [request] = await db`
    UPDATE "SupportRequest" SET "status" = 'CANCELLED', "updatedAt" = NOW()
    WHERE "id" = ${id.data} AND "familyGroupId" = ${context.familyId}
      AND "createdById" = ${context.userId} AND "status" IN ('OPEN', 'CLAIMED')
    RETURNING "id"
  `;
  if (!request) throw new Error("Puoi ritirare solo una tua richiesta ancora attiva.");
  revalidatePath("/tasks");
}
