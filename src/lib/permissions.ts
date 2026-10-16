import { DEFAULT_ROLE_PERMISSIONS, Permission, PERMISSIONS, PermissionKey, RoleKey } from "@/lib/domain";

export type MembershipLike = {
  permission: Permission;
  roleKey: RoleKey;
  permissions: Record<string, boolean> | null;
};

// Un ruolo definisce cosa una persona può fare nel prodotto, mai chi è nella famiglia.
export function effectivePermissions(membership: MembershipLike): Set<PermissionKey> {
  const base = new Set<PermissionKey>(DEFAULT_ROLE_PERMISSIONS[membership.roleKey] ?? DEFAULT_ROLE_PERMISSIONS.member);
  const overrides = membership.permissions ?? {};
  for (const key of PERMISSIONS) {
    if (overrides[key] === true) base.add(key);
    if (overrides[key] === false) base.delete(key);
  }
  return base;
}

export function can(membership: MembershipLike, key: PermissionKey): boolean {
  return effectivePermissions(membership).has(key);
}

export function canAny(membership: MembershipLike, keys: PermissionKey[]): boolean {
  const granted = effectivePermissions(membership);
  return keys.some((key) => granted.has(key));
}

// Il permesso grossolano (enum storico) resta per compatibilità: ADMIN implica sempre i permessi amministrativi.
export function isAdministrator(membership: MembershipLike): boolean {
  return membership.permission === Permission.ADMIN || membership.roleKey === "owner" || membership.roleKey === "administrator";
}

export function roleFromPermission(permission: Permission): RoleKey {
  if (permission === Permission.ADMIN) return RoleKey.ADMINISTRATOR;
  if (permission === Permission.HELPER) return RoleKey.MEMBER;
  return RoleKey.LIMITED_MEMBER;
}
