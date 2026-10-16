import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getFamilyContext() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await prisma.familyMember.findMany({
    where: { userId: session.user.id },
    include: { familyGroup: true },
    orderBy: { joinedAt: "asc" },
  });

  if (!memberships.length) redirect("/onboarding");

  return {
    userId: session.user.id,
    membership: memberships[0],
    familyId: memberships[0].familyGroupId,
    family: memberships[0].familyGroup,
    isAdmin: memberships[0].permission === Permission.ADMIN,
  };
}

export async function requireAdmin() {
  const context = await getFamilyContext();
  if (!context.isAdmin) throw new Error("È richiesta l’autorizzazione di un genitore o tutore principale.");
  return context;
}
