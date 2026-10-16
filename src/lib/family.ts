import { Permission, PermissionKey, RoleKey } from "@/lib/domain";
import { effectivePermissions, isAdministrator } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type MembershipContext = {
  id: string;
  userId: string;
  familyGroupId: string;
  roleName: string;
  roleKey: RoleKey;
  permission: Permission;
  permissions: Record<string, boolean>;
  kidProfileId: string | null;
  color: string;
  joinedAt: Date;
};

export type FamilyContext = {
  userId: string;
  membership: MembershipContext;
  familyId: string;
  family: {
    id: string;
    name: string;
    type: string;
    inviteCode: string;
    timezone: string;
    locale: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  isAdmin: boolean;
  capabilities: Set<PermissionKey>;
};

// Se lo schema storico assegna ADMIN ma non ha mai definito un ruolo tecnico,
// riconciliamo il ruolo così i permessi restano coerenti con il privilegio effettivo.
function reconcileRole(roleKey: string, permission: Permission): RoleKey {
  const known: RoleKey[] = ["owner", "administrator", "member", "limited_member", "caregiver", "observer", "guest", "service_provider"];
  if (known.includes(roleKey as RoleKey)) {
    if (permission === Permission.ADMIN && (roleKey === "limited_member" || roleKey === "observer" || roleKey === "guest")) {
      return "administrator";
    }
    return roleKey as RoleKey;
  }
  if (permission === Permission.ADMIN) return "administrator";
  if (permission === Permission.HELPER) return "member";
  return "limited_member";
}

export async function getFamilyContext(): Promise<FamilyContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await db`
    SELECT fm."id", fm."userId", fm."familyGroupId", fm."roleName", fm."permission", fm."roleKey",
      fm."permissions", fm."kidProfileId", fm."color", fm."status",
      fg."name" AS "familyName", fg."type" AS "familyType", fg."inviteCode", fg."timezone",
      fg."locale" AS "familyLocale", fg."description" AS "familyDescription",
      fg."createdAt" AS "familyCreatedAt", fg."updatedAt" AS "familyUpdatedAt"
    FROM "FamilyMember" fm
    JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
    WHERE fm."userId" = ${session.user.id} AND fm."status" = 'active'
    ORDER BY fm."joinedAt" ASC
    LIMIT 1
  `;
  if (!memberships.length) redirect("/onboarding");

  const membership = memberships[0];
  const roleKey = reconcileRole(String(membership.roleKey ?? "member"), membership.permission as Permission);
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const membershipContext: MembershipContext = {
    id: membership.id as string,
    userId: membership.userId as string,
    familyGroupId: membership.familyGroupId as string,
    roleName: membership.roleName as string,
    roleKey,
    permission: membership.permission as Permission,
    permissions,
    kidProfileId: (membership.kidProfileId as string | null) ?? null,
    color: (membership.color as string | null) ?? "#7855dc",
    joinedAt: membership.joinedAt as Date,
  };

  return {
    userId: session.user.id,
    membership: membershipContext,
    familyId: membership.familyGroupId as string,
    family: {
      id: membership.familyGroupId as string,
      name: membership.familyName as string,
      type: (membership.familyType as string) ?? "custom",
      inviteCode: membership.inviteCode as string,
      timezone: membership.timezone as string,
      locale: (membership.familyLocale as string) ?? "it-IT",
      description: (membership.familyDescription as string | null) ?? null,
      createdAt: membership.familyCreatedAt as Date,
      updatedAt: membership.familyUpdatedAt as Date,
    },
    isAdmin: isAdministrator(membershipContext),
    capabilities: effectivePermissions(membershipContext),
  };
}

export async function requireAdmin() {
  const context = await getFamilyContext();
  if (!context.isAdmin) throw new Error("È richiesta l'autorizzazione di chi amministra questo spazio.");
  return context;
}

export async function requireFamilyCoordinator() {
  const context = await getFamilyContext();
  if (context.membership.permission === Permission.MEMBER) {
    throw new Error("Solo chi coordina o supporta il nucleo può gestire gli impegni condivisi.");
  }
  return context;
}

// Il minimo privilegio è applicato lato server: ogni azione sensibile lo verifica esplicitamente.
export function hasPermission(context: FamilyContext, key: PermissionKey): boolean {
  return context.capabilities.has(key);
}

export async function requirePermission(key: PermissionKey): Promise<FamilyContext> {
  const context = await getFamilyContext();
  if (!hasPermission(context, key)) {
    throw new Error("Non hai il permesso necessario per questa operazione.");
  }
  return context;
}
