import { Category } from "@prisma/client";
import { CalendarBoard, BoardEvent, BoardPerson } from "@/components/calendar-board";
import { AppPage } from "@/components/app-page";
import { dateTimeFromLocal } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { getFamilyContext } from "@/lib/family";
import { dateKey, mondayOffset } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const context = await getFamilyContext();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDate = new Date(firstOfMonth);
  startDate.setDate(startDate.getDate() - mondayOffset(firstOfMonth));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 42);
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);

  const [memberships, kids, events] = await Promise.all([
    prisma.familyMember.findMany({
      where: {
        familyGroupId: context.familyId,
        ...(context.membership.permission === "MEMBER" ? { id: context.membership.id } : {}),
      },
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
        kidProfile: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.kidProfile.findMany({
      where: {
        familyGroupId: context.familyId,
        ...(context.membership.permission === "MEMBER" ? { id: context.membership.kidProfileId ?? "__no_linked_child__" } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.event.findMany({
      where: {
        familyGroupId: context.familyId,
        startTime: { gte: dateTimeFromLocal(startKey, "00:00", context.family.timezone), lt: dateTimeFromLocal(endKey, "00:00", context.family.timezone) },
        ...(context.membership.permission === "MEMBER"
          ? {
              OR: [
                { assignedUserId: context.userId },
                { chaperoneUserId: context.userId },
                { pickupUserId: context.userId },
                ...(context.membership.kidProfileId ? [{ kidProfileId: context.membership.kidProfileId }] : []),
              ],
            }
          : {}),
      },
      orderBy: { startTime: "asc" },
      include: {
        assignedUser: { select: { id: true, name: true, avatarColor: true } },
        chaperoneUser: { select: { id: true, name: true } },
        pickupUser: { select: { id: true, name: true } },
        kidProfile: { select: { id: true, name: true, avatarColor: true } },
      },
    }),
  ]);

  const people: BoardPerson[] = [
    ...memberships.map((membership) => ({
      id: `user:${membership.user.id}`,
      userId: membership.user.id,
      name: membership.user.name,
      role: membership.roleName,
      color: membership.user.avatarColor,
      initials: membership.user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      type: "user" as const,
      permission: membership.permission,
    })),
    ...kids.map((kid) => ({
      id: `kid:${kid.id}`,
      userId: "",
      name: kid.name,
      role: "Figlio",
      color: kid.avatarColor,
      initials: kid.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      type: "kid" as const,
      permission: "MEMBER" as const,
    })),
  ];

  const boardEvents: BoardEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    category: event.category as Category,
    status: event.status,
    assignedUserId: event.assignedUserId,
    assignedUser: event.assignedUser,
    chaperoneUser: event.chaperoneUser,
    pickupUser: event.pickupUser,
    kidProfile: event.kidProfile,
  }));

  return (
    <AppPage>
      <CalendarBoard
        initialDate={dateKey(today)}
        initialEvents={boardEvents}
        people={people}
        canManage={context.isAdmin || context.membership.permission === "HELPER"}
        initialRange={{ from: startKey, to: endKey }}
      />
    </AppPage>
  );
}
