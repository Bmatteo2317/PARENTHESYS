import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getFamilyContext } from "@/lib/family";
import { prisma } from "@/lib/prisma";

export async function AppPage({ children }: { children: ReactNode }) {
  const context = await getFamilyContext();
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { name: true, avatarColor: true },
  });
  return (
    <AppShell
      familyName={context.family.name}
      userName={user?.name ?? context.membership.roleName}
      roleName={context.membership.roleName}
      avatarColor={user?.avatarColor ?? "#7855dc"}
    >
      {children}
    </AppShell>
  );
}
