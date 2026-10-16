"use server";

import { Permission, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFamilyContext, requireAdmin } from "@/lib/family";
import { prisma } from "@/lib/prisma";

const roleSchema = z.string().trim().min(2).max(40);
const familyNameSchema = z.string().trim().min(2).max(80);
export type FamilyActionState = { error?: string };

function newInviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export async function createFamily(_previous: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const familyName = familyNameSchema.safeParse(formData.get("familyName"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  if (!familyName.success || !roleName.success) return { error: "Inserisci un nome famiglia e un ruolo validi." };

  const { userId } = await getFamilyContextWithoutMembership();
  try {
    await prisma.familyGroup.create({
      data: {
        name: familyName.data,
        inviteCode: newInviteCode(),
        members: { create: { userId, roleName: roleName.data, permission: Permission.ADMIN } },
      },
    });
  } catch (error) {
    console.error("Creazione della famiglia non riuscita.", error);
    return { error: "Non è stato possibile creare la famiglia. Riprova." };
  }

  revalidatePath("/", "layout");
  redirect("/calendar");
}

async function getFamilyContextWithoutMembership() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const existing = await prisma.familyMember.findFirst({ where: { userId: session.user.id } });
  if (existing) redirect("/calendar");
  return { userId: session.user.id };
}

export async function joinFamily(_previous: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const inviteCode = z.string().trim().min(6).max(20).safeParse(formData.get("inviteCode"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  const permissionValue = z.enum(["HELPER", "MEMBER"]).safeParse(formData.get("permission"));
  if (!inviteCode.success || !roleName.success || !permissionValue.success) return { error: "Controlla il codice invito e il ruolo scelto." };

  const { userId } = await getFamilyContextWithoutMembership();
  const family = await prisma.familyGroup.findUnique({ where: { inviteCode: inviteCode.data.toUpperCase() } });
  if (!family) return { error: "Il codice invito non è valido." };

  try {
    await prisma.familyMember.create({
      data: {
        userId,
        familyGroupId: family.id,
        roleName: roleName.data,
        permission: permissionValue.data,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Fai già parte di questa famiglia." };
    }
    console.error("Accesso al gruppo famiglia non riuscito.", error);
    return { error: "Non è stato possibile unirsi al gruppo. Riprova." };
  }

  revalidatePath("/", "layout");
  redirect("/calendar");
}

export async function addKid(formData: FormData) {
  const context = await requireAdmin();
  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  const birthDateValue = z.string().optional().safeParse(formData.get("birthDate") || undefined);
  const avatarColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).safeParse(formData.get("avatarColor"));
  if (!name.success || !birthDateValue.success || !avatarColor.success) throw new Error("Controlla i dati del profilo.");

  await prisma.kidProfile.create({
    data: {
      familyGroupId: context.familyId,
      name: name.data,
      avatarColor: avatarColor.data,
      birthDate: birthDateValue.data ? new Date(`${birthDateValue.data}T12:00:00Z`) : null,
    },
  });
  revalidatePath("/family");
  revalidatePath("/calendar");
}

export async function updateMemberRole(formData: FormData) {
  const context = await requireAdmin();
  const memberId = z.string().min(1).safeParse(formData.get("memberId"));
  const permission = z.enum(["ADMIN", "HELPER", "MEMBER"]).safeParse(formData.get("permission"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  if (!memberId.success || !permission.success || !roleName.success) throw new Error("Controlla il ruolo scelto.");
  const target = await prisma.familyMember.findFirst({ where: { id: memberId.data, familyGroupId: context.familyId } });
  if (!target) throw new Error("Il membro selezionato non appartiene a questa famiglia.");
  if (target.userId === context.userId && permission.data !== Permission.ADMIN) {
    throw new Error("Non puoi rimuovere il tuo ruolo di amministratore.");
  }
  await prisma.familyMember.update({
    where: { id: target.id },
    data: { permission: permission.data, roleName: roleName.data },
  });
  revalidatePath("/family");
}

export async function linkMemberToKid(formData: FormData) {
  const context = await requireAdmin();
  const memberId = z.string().min(1).safeParse(formData.get("memberId"));
  const kidProfileId = z.string().optional().safeParse(formData.get("kidProfileId") || undefined);
  if (!memberId.success || !kidProfileId.success) throw new Error("Il profilo selezionato non è valido.");
  const member = await prisma.familyMember.findFirst({ where: { id: memberId.data, familyGroupId: context.familyId } });
  if (!member) throw new Error("Il membro selezionato non appartiene a questa famiglia.");
  if (kidProfileId.data) {
    const kid = await prisma.kidProfile.findFirst({ where: { id: kidProfileId.data, familyGroupId: context.familyId } });
    if (!kid) throw new Error("Il profilo del figlio selezionato non appartiene a questa famiglia.");
  }
  try {
    await prisma.familyMember.update({
      where: { id: member.id },
      data: { kidProfileId: kidProfileId.data ?? null },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Questo profilo è già collegato a un altro account.");
    }
    throw error;
  }
  revalidatePath("/family");
  revalidatePath("/calendar");
}

export async function updateWorkSchedule(formData: FormData) {
  const context = await getFamilyContext();
  const start = z.string().regex(/^\d{2}:\d{2}$/).safeParse(formData.get("start"));
  const end = z.string().regex(/^\d{2}:\d{2}$/).safeParse(formData.get("end"));
  const days = formData.getAll("day").map((value) => Number(value));
  if (!start.success || !end.success || end.data <= start.data || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Inserisci un orario di lavoro e dei giorni validi.");
  }
  const unavailable = days.map((day) => ({ day, start: start.data, end: end.data }));
  await prisma.user.update({
    where: { id: context.userId },
    data: { workSchedule: { unavailable } },
  });
  revalidatePath("/family");
  revalidatePath("/calendar");
}
