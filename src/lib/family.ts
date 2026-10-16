import { Permission } from "@/lib/domain";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function getFamilyContext() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await db`
    SELECT fm."id", fm."userId", fm."familyGroupId", fm."roleName", fm."permission",
      fm."kidProfileId", fm."joinedAt", fg."name" AS "familyName", fg."inviteCode",
      fg."timezone", fg."createdAt" AS "familyCreatedAt", fg."updatedAt" AS "familyUpdatedAt"
    FROM "FamilyMember" fm
    JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
    WHERE fm."userId" = ${session.user.id}
    ORDER BY fm."joinedAt" ASC
    LIMIT 1
  `;
  if (!memberships.length) redirect("/onboarding");

  const membership = memberships[0];
  return {
    userId: session.user.id,
    membership: {
      id: membership.id,
      userId: membership.userId,
      familyGroupId: membership.familyGroupId,
      roleName: membership.roleName,
      permission: membership.permission as Permission,
      kidProfileId: membership.kidProfileId as string | null,
      joinedAt: membership.joinedAt as Date,
    },
    familyId: membership.familyGroupId as string,
    family: {
      id: membership.familyGroupId as string,
      name: membership.familyName as string,
      inviteCode: membership.inviteCode as string,
      timezone: membership.timezone as string,
      createdAt: membership.familyCreatedAt as Date,
      updatedAt: membership.familyUpdatedAt as Date,
    },
    isAdmin: membership.permission === Permission.ADMIN,
  };
}

export async function requireAdmin() {
  const context = await getFamilyContext();
  if (!context.isAdmin) throw new Error("È richiesta l’autorizzazione di un genitore o tutore principale.");
  return context;
}

export async function requireFamilyCoordinator() {
  const context = await getFamilyContext();
  if (context.membership.permission === Permission.MEMBER) {
    throw new Error("Solo un genitore, tutore o familiare della rete di supporto può gestire gli impegni.");
  }
  return context;
}
