"use server";

import { Permission, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getFamilyContext, requireAdmin } from "@/lib/family";
import { prisma } from "@/lib/prisma";

export async function createTask(formData: FormData) {
  const context = await requireAdmin();
  const title = z.string().trim().min(2).max(120).safeParse(formData.get("title"));
  const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("dueDate"));
  const assignedToId = z.string().min(1).safeParse(formData.get("assignedToId"));
  const points = z.coerce.number().int().min(0).max(100).safeParse(formData.get("points"));
  if (!title.success || !dueDate.success || !assignedToId.success || !points.success) throw new Error("Controlla i dati dell’attività.");
  if (!(await prisma.familyMember.findFirst({ where: { userId: assignedToId.data, familyGroupId: context.familyId } }))) {
    throw new Error("La persona scelta non appartiene a questa famiglia.");
  }
  await prisma.task.create({
    data: {
      familyGroupId: context.familyId,
      title: title.data,
      assignedToId: assignedToId.data,
      createdById: context.userId,
      dueDate: new Date(`${dueDate.data}T12:00:00Z`),
      points: points.data,
    },
  });
  revalidatePath("/tasks");
}

export async function toggleTask(formData: FormData) {
  const context = await getFamilyContext();
  const id = z.string().min(1).safeParse(formData.get("id"));
  if (!id.success) throw new Error("Attività non valida.");
  const task = await prisma.task.findFirst({ where: { id: id.data, familyGroupId: context.familyId } });
  if (!task) throw new Error("Attività non trovata.");
  if (context.membership.permission === Permission.MEMBER && task.assignedToId !== context.userId) {
    throw new Error("Puoi completare solo le attività assegnate a te.");
  }
  const completed = task.status === TaskStatus.COMPLETED;
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: completed ? TaskStatus.PENDING : TaskStatus.COMPLETED,
      completedAt: completed ? null : new Date(),
    },
  });
  revalidatePath("/tasks");
}
