"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_ROLE_PERMISSIONS, HOUSEHOLD_TYPES, PERMISSIONS, ROLE_META, RoleKey } from "@/lib/domain";
import { requirePermission } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const roleKeys = Object.keys(ROLE_META) as RoleKey[];

function inviteToken() {
  return randomBytes(24).toString("base64url");
}

function inviteShortCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

const inviteSchema = z.object({
  roleKey: z.enum(roleKeys as [RoleKey, ...RoleKey[]]),
  permission: z.enum(["ADMIN", "HELPER", "MEMBER"]),
  label: z.string().trim().max(80).optional(),
  careProfileId: z.string().optional(),
  maxUses: z.coerce.number().int().min(1).max(20).default(1),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
});

// Ogni invito dichiara in anticipo ruolo e livello di accesso: nessuna sorpresa per chi entra.
export async function createInvitation(formData: FormData) {
  const context = await requirePermission("invite.manage");
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("I dati dell'invito non sono validi.");
  const input = parsed.data;

  if (input.careProfileId) {
    const [profile] = await db`
      SELECT "id" FROM "KidProfile" WHERE "id" = ${input.careProfileId} AND "familyGroupId" = ${context.familyId} LIMIT 1
    `;
    if (!profile) throw new Error("Il profilo assistito scelto non appartiene a questo nucleo.");
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

  const [created] = await db`
    INSERT INTO "Invitation" ("id", "familyGroupId", "token", "shortCode", "roleKey", "permission", "careProfileId", "createdById", "label", "maxUses", "expiresAt")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${inviteToken()}, ${inviteShortCode()}, ${input.roleKey}, ${input.permission},
      ${input.careProfileId || null}, ${context.userId}, ${input.label ?? null}, ${input.maxUses}, ${expiresAt})
    RETURNING "id", "token", "shortCode", "expiresAt"
  `;

  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "invitation.create",
    entityType: "Invitation",
    entityId: created.id as string,
    afterValue: { roleKey: input.roleKey, maxUses: input.maxUses },
  });

  revalidatePath("/family");
  return { id: created.id as string, token: created.token as string, shortCode: created.shortCode as string };
}

export async function revokeInvitation(formData: FormData) {
  const context = await requirePermission("invite.manage");
  const parsed = z.string().min(1).safeParse(formData.get("invitationId"));
  if (!parsed.success) throw new Error("Invito non valido.");
  await db`
    UPDATE "Invitation" SET "revokedAt" = NOW()
    WHERE "id" = ${parsed.data} AND "familyGroupId" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "invitation.revoke",
    entityType: "Invitation",
    entityId: parsed.data,
  });
  revalidatePath("/family");
}

const memberAccessSchema = z.object({
  memberId: z.string().min(1),
  roleKey: z.enum(roleKeys as [RoleKey, ...RoleKey[]]),
  permission: z.enum(["ADMIN", "HELPER", "MEMBER"]),
  roleName: z.string().trim().min(2).max(40),
});

// I permessi sono granulari: si parte dal ruolo, poi si aggiungono o tolgono singole capacità.
export async function updateMemberAccess(formData: FormData) {
  const context = await requirePermission("settings.manage");
  const parsed = memberAccessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Controlla il ruolo e i permessi scelti.");
  const input = parsed.data;

  const [target] = await db`
    SELECT "id", "userId", "roleKey", "permissions" FROM "FamilyMember"
    WHERE "id" = ${input.memberId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!target) throw new Error("La persona scelta non appartiene a questo nucleo.");

  const selected = new Set(formData.getAll("permission").map(String));
  const defaults = new Set<string>(DEFAULT_ROLE_PERMISSIONS[input.roleKey] ?? []);
  const overrides: Record<string, boolean> = {};
  for (const key of PERMISSIONS) {
    if (selected.has(key) && !defaults.has(key)) overrides[key] = true;
    if (!selected.has(key) && defaults.has(key)) overrides[key] = false;
  }

  const losingAdmin = target.userId === context.userId && input.permission !== "ADMIN";
  if (losingAdmin) throw new Error("Non puoi rimuovere il tuo stesso accesso amministrativo.");

  await db`
    UPDATE "FamilyMember" SET "roleKey" = ${input.roleKey}, "permission" = ${input.permission},
      "roleName" = ${input.roleName}, "permissions" = ${JSON.stringify(overrides)}::jsonb
    WHERE "id" = ${input.memberId} AND "familyGroupId" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "member.access.update",
    entityType: "FamilyMember",
    entityId: input.memberId,
    beforeValue: { roleKey: target.roleKey, permissions: target.permissions },
    afterValue: { roleKey: input.roleKey, permissions: overrides },
  });

  revalidatePath("/family");
  revalidatePath("/", "layout");
}

export async function removeMember(formData: FormData) {
  const context = await requirePermission("settings.manage");
  const parsed = z.string().min(1).safeParse(formData.get("memberId"));
  if (!parsed.success) throw new Error("Persona non valida.");
  const [target] = await db`
    SELECT "id", "userId" FROM "FamilyMember"
    WHERE "id" = ${parsed.data} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!target) throw new Error("La persona scelta non appartiene a questo nucleo.");
  if (target.userId === context.userId) throw new Error("Per uscire dal nucleo usa l'opzione dedicata in Privacy.");
  await db`
    UPDATE "FamilyMember" SET "status" = 'removed'
    WHERE "id" = ${parsed.data} AND "familyGroupId" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "member.remove",
    entityType: "FamilyMember",
    entityId: parsed.data,
  });
  revalidatePath("/family");
  revalidatePath("/", "layout");
}

const familySchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(HOUSEHOLD_TYPES.map((type) => type.value) as unknown as [string, ...string[]]),
  description: z.string().trim().max(400).optional(),
  timezone: z.string().trim().min(2).max(60),
  locale: z.string().trim().min(2).max(10),
});

export async function updateFamilyProfile(formData: FormData) {
  const context = await requirePermission("settings.manage");
  const parsed = familySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Controlla le impostazioni del nucleo.");
  const input = parsed.data;
  await db`
    UPDATE "FamilyGroup" SET "name" = ${input.name}, "type" = ${input.type}, "description" = ${input.description ?? null},
      "timezone" = ${input.timezone}, "locale" = ${input.locale}, "updatedAt" = NOW()
    WHERE "id" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "family.update",
    entityType: "FamilyGroup",
    entityId: context.familyId,
    afterValue: { name: input.name, type: input.type },
  });
  revalidatePath("/family");
  revalidatePath("/", "layout");
}
