"use server";

import { Permission } from "@/lib/domain";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFamilyContext, requireAdmin } from "@/lib/family";
import { db } from "@/lib/db";
import { isCalendarDate } from "@/lib/datetime";

const roleSchema = z.string().trim().min(2).max(40);
const familyNameSchema = z.string().trim().min(2).max(80);
const phoneSchema = z.string().trim().max(30).regex(/^[+\d\s().-]*$/);
export type FamilyActionState = { error?: string };

function newInviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function createFamily(_previous: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const familyName = familyNameSchema.safeParse(formData.get("familyName"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  if (!familyName.success || !roleName.success) return { error: "Inserisci un nome famiglia e un ruolo validi." };

  const { userId } = await getFamilyContextWithoutMembership();
  try {
    await db`
      WITH family AS (
        INSERT INTO "FamilyGroup" ("id", "name", "inviteCode", "updatedAt")
        VALUES (gen_random_uuid()::text, ${familyName.data}, ${newInviteCode()}, NOW())
        RETURNING "id"
      )
      INSERT INTO "FamilyMember" ("id", "userId", "familyGroupId", "roleName", "permission")
      SELECT gen_random_uuid()::text, ${userId}, family."id", ${roleName.data}, ${Permission.ADMIN}
      FROM family
    `;
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
  const existing = await db`SELECT "id" FROM "FamilyMember" WHERE "userId" = ${session.user.id} LIMIT 1`;
  if (existing.length) redirect("/calendar");
  return { userId: session.user.id };
}

export async function joinFamily(_previous: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const inviteCode = z.string().trim().min(6).max(20).safeParse(formData.get("inviteCode"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  const permissionValue = z.enum(["HELPER", "MEMBER"]).safeParse(formData.get("permission"));
  if (!inviteCode.success || !roleName.success || !permissionValue.success) return { error: "Controlla il codice invito e il ruolo scelto." };

  const { userId } = await getFamilyContextWithoutMembership();
  const [family] = await db`SELECT "id" FROM "FamilyGroup" WHERE "inviteCode" = ${inviteCode.data.toUpperCase()} LIMIT 1`;
  if (!family) return { error: "Il codice invito non è valido." };

  try {
    await db`
      INSERT INTO "FamilyMember" ("id", "userId", "familyGroupId", "roleName", "permission")
      VALUES (gen_random_uuid()::text, ${userId}, ${family.id}, ${roleName.data}, ${permissionValue.data})
    `;
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Fai già parte di questa famiglia." };
    console.error("Accesso al gruppo famiglia non riuscito.", error);
    return { error: "Non è stato possibile unirsi al gruppo. Riprova." };
  }

  revalidatePath("/", "layout");
  redirect("/calendar");
}

export async function updateAccount(formData: FormData) {
  const context = await getFamilyContext();
  const name = z.string().trim().min(2).max(80).safeParse(formData.get("name"));
  const phone = phoneSchema.safeParse(formData.get("phone") || "");
  const avatarColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).safeParse(formData.get("avatarColor"));
  if (!name.success || !phone.success || !avatarColor.success) throw new Error("Controlla nome, cellulare e colore del profilo.");
  await db`UPDATE "User" SET "name" = ${name.data}, "phone" = ${phone.data || null}, "avatarColor" = ${avatarColor.data}, "updatedAt" = NOW() WHERE "id" = ${context.userId}`;
  revalidatePath("/account");
  revalidatePath("/calendar");
  revalidatePath("/family");
}

export async function addKid(formData: FormData) {
  const context = await requireAdmin();
  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  const birthDateValue = z.string().refine(isCalendarDate).optional().safeParse(formData.get("birthDate") || undefined);
  const avatarColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).safeParse(formData.get("avatarColor"));
  if (!name.success || !birthDateValue.success || !avatarColor.success) throw new Error("Controlla i dati del profilo.");

  await db`
    INSERT INTO "KidProfile" ("id", "familyGroupId", "name", "avatarColor", "birthDate")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${name.data}, ${avatarColor.data},
      ${birthDateValue.data ? new Date(`${birthDateValue.data}T12:00:00Z`) : null})
  `;
  revalidatePath("/family");
  revalidatePath("/calendar");
}

export async function updateMemberRole(formData: FormData) {
  const context = await requireAdmin();
  const memberId = z.string().min(1).safeParse(formData.get("memberId"));
  const permission = z.enum(["ADMIN", "HELPER", "MEMBER"]).safeParse(formData.get("permission"));
  const roleName = roleSchema.safeParse(formData.get("roleName"));
  if (!memberId.success || !permission.success || !roleName.success) throw new Error("Controlla il ruolo scelto.");
  const [target] = await db`
    SELECT "id", "userId" FROM "FamilyMember"
    WHERE "id" = ${memberId.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!target) throw new Error("Il membro selezionato non appartiene a questa famiglia.");
  if (target.userId === context.userId && permission.data !== Permission.ADMIN) {
    throw new Error("Non puoi rimuovere il tuo ruolo di amministratore.");
  }
  await db`
    UPDATE "FamilyMember" SET "permission" = ${permission.data}, "roleName" = ${roleName.data}
    WHERE "id" = ${target.id} AND "familyGroupId" = ${context.familyId}
  `;
  revalidatePath("/family");
}

export async function linkMemberToKid(formData: FormData) {
  const context = await requireAdmin();
  const memberId = z.string().min(1).safeParse(formData.get("memberId"));
  const kidProfileId = z.string().optional().safeParse(formData.get("kidProfileId") || undefined);
  if (!memberId.success || !kidProfileId.success) throw new Error("Il profilo selezionato non è valido.");
  const [member] = await db`
    SELECT "id" FROM "FamilyMember" WHERE "id" = ${memberId.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!member) throw new Error("Il membro selezionato non appartiene a questa famiglia.");
  if (kidProfileId.data) {
    const [kid] = await db`
      SELECT "id", "birthDate" FROM "KidProfile" WHERE "id" = ${kidProfileId.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
    `;
    if (!kid) throw new Error("Il profilo del figlio selezionato non appartiene a questa famiglia.");
    if (!kid.birthDate || new Date(kid.birthDate).getTime() > Date.now() - 14 * 365.25 * 24 * 60 * 60 * 1000) {
      throw new Error("Un account personale può essere collegato solo a un figlio di almeno 14 anni.");
    }
  }
  try {
    await db`
      UPDATE "FamilyMember" SET "kidProfileId" = ${kidProfileId.data ?? null}
      WHERE "id" = ${member.id} AND "familyGroupId" = ${context.familyId}
    `;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Questo profilo è già collegato a un altro account.");
    throw error;
  }
  revalidatePath("/family");
  revalidatePath("/calendar");
}

export async function updateWorkSchedule(formData: FormData) {
  const context = await getFamilyContext();
  const start = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).safeParse(formData.get("start"));
  const end = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).safeParse(formData.get("end"));
  const days = formData.getAll("day").map((value) => Number(value));
  if (!start.success || !end.success || end.data <= start.data || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Inserisci un orario di lavoro e dei giorni validi.");
  }
  const unavailable = days.map((day) => ({ day, start: start.data, end: end.data }));
  await db`UPDATE "User" SET "workSchedule" = ${JSON.stringify({ unavailable })}::jsonb, "updatedAt" = NOW() WHERE "id" = ${context.userId}`;
  revalidatePath("/family");
  revalidatePath("/calendar");
}
