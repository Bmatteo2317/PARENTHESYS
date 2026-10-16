import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";

export async function AppPage({ children }: { children: ReactNode }) {
  const context = await getFamilyContext();
  const [user] = await db`SELECT "name", "avatarColor" FROM "User" WHERE "id" = ${context.userId} LIMIT 1`;
  return (
    <AppShell
      familyName={context.family.name}
      userName={user?.name ?? context.membership.roleName}
      roleName={context.membership.roleName}
      avatarColor={user?.avatarColor ?? "#7855dc"}
      isAdmin={context.isAdmin}
    >
      {children}
    </AppShell>
  );
}
