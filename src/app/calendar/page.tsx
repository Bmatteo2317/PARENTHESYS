import { Category } from "@/lib/domain";
import { CalendarBoard, BoardEvent, BoardPerson } from "@/components/calendar-board";
import { AppPage } from "@/components/app-page";
import { dateTimeFromLocal } from "@/lib/datetime";
import { db } from "@/lib/db";
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
  const seeAll = context.membership.permission !== "MEMBER";
  const memberId = context.membership.id;
  const kidProfileId = context.membership.kidProfileId;
  const rangeStart = dateTimeFromLocal(startKey, "00:00", context.family.timezone);
  const rangeEnd = dateTimeFromLocal(endKey, "00:00", context.family.timezone);

  const [memberships, kids, events] = await Promise.all([
    db`
      SELECT fm."roleName", fm."permission", u."id" AS "userId", u."name" AS "userName", u."avatarColor" AS "userColor",
        kp."id" AS "kidId", kp."name" AS "kidName", kp."avatarColor" AS "kidColor"
      FROM "FamilyMember" fm JOIN "User" u ON u."id" = fm."userId"
      LEFT JOIN "KidProfile" kp ON kp."id" = fm."kidProfileId"
      WHERE fm."familyGroupId" = ${context.familyId} AND (${seeAll} OR fm."id" = ${memberId})
      ORDER BY fm."joinedAt" ASC
    `,
    db`
      SELECT "id", "name", "avatarColor" FROM "KidProfile"
      WHERE "familyGroupId" = ${context.familyId} AND (${seeAll} OR "id" = ${kidProfileId})
      ORDER BY "createdAt" ASC
    `,
    db`
      SELECT e."id", e."title", e."description", e."location", e."startTime", e."endTime", e."category",
        e."status", e."assignedUserId",
        CASE WHEN au."id" IS NULL THEN NULL ELSE jsonb_build_object('id', au."id", 'name', au."name", 'avatarColor', au."avatarColor") END AS "assignedUser",
        CASE WHEN cu."id" IS NULL THEN NULL ELSE jsonb_build_object('id', cu."id", 'name', cu."name") END AS "chaperoneUser",
        CASE WHEN pu."id" IS NULL THEN NULL ELSE jsonb_build_object('id', pu."id", 'name', pu."name") END AS "pickupUser",
        CASE WHEN kp."id" IS NULL THEN NULL ELSE jsonb_build_object('id', kp."id", 'name', kp."name", 'avatarColor', kp."avatarColor") END AS "kidProfile"
      FROM "Event" e
      LEFT JOIN "User" au ON au."id" = e."assignedUserId"
      LEFT JOIN "User" cu ON cu."id" = e."chaperoneUserId"
      LEFT JOIN "User" pu ON pu."id" = e."pickupUserId"
      LEFT JOIN "KidProfile" kp ON kp."id" = e."kidProfileId"
      WHERE e."familyGroupId" = ${context.familyId} AND e."startTime" >= ${rangeStart} AND e."startTime" < ${rangeEnd}
        AND (${seeAll} OR e."assignedUserId" = ${context.userId} OR e."chaperoneUserId" = ${context.userId}
          OR e."pickupUserId" = ${context.userId} OR (${kidProfileId !== null} AND e."kidProfileId" = ${kidProfileId}))
      ORDER BY e."startTime" ASC
    `,
  ]);

  const people: BoardPerson[] = [
    ...memberships.map((membership) => ({
      id: `user:${membership.userId}`,
      userId: membership.userId,
      name: membership.userName,
      role: membership.roleName,
      color: membership.userColor,
      initials: membership.userName.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase(),
      type: "user" as const,
      permission: membership.permission,
    })),
    ...kids.map((kid) => ({
      id: `kid:${kid.id}`,
      userId: "",
      name: kid.name,
      role: "Figlio",
      color: kid.avatarColor,
      initials: kid.name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase(),
      type: "kid" as const,
      permission: "MEMBER" as const,
    })),
  ];

  const boardEvents: BoardEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: new Date(event.startTime).toISOString(),
    endTime: new Date(event.endTime).toISOString(),
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
