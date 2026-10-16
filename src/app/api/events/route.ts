import { NextRequest, NextResponse } from "next/server";
import { dateTimeFromLocal, isCalendarDate } from "@/lib/datetime";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const dateSchema = z.string().refine(isCalendarDate);

export async function GET(request: NextRequest) {
  const context = await getFamilyContext();
  const from = dateSchema.safeParse(request.nextUrl.searchParams.get("from"));
  const to = dateSchema.safeParse(request.nextUrl.searchParams.get("to"));
  if (!from.success || !to.success || to.data <= from.data) {
    return NextResponse.json({ error: "Intervallo di date non valido." }, { status: 400 });
  }

  const start = dateTimeFromLocal(from.data, "00:00", context.family.timezone);
  const end = dateTimeFromLocal(to.data, "00:00", context.family.timezone);
  const seeAll = context.membership.permission !== "MEMBER";
  const kidProfileId = context.membership.kidProfileId;
  const events = await db`
    SELECT e."id", e."title", e."description", e."location", e."startTime", e."endTime",
      e."category", e."status", e."assignedUserId",
      CASE WHEN au."id" IS NULL THEN NULL ELSE jsonb_build_object('id', au."id", 'name', au."name", 'avatarColor', au."avatarColor") END AS "assignedUser",
      CASE WHEN cu."id" IS NULL THEN NULL ELSE jsonb_build_object('id', cu."id", 'name', cu."name") END AS "chaperoneUser",
      CASE WHEN pu."id" IS NULL THEN NULL ELSE jsonb_build_object('id', pu."id", 'name', pu."name") END AS "pickupUser",
      CASE WHEN kp."id" IS NULL THEN NULL ELSE jsonb_build_object('id', kp."id", 'name', kp."name", 'avatarColor', kp."avatarColor") END AS "kidProfile"
    FROM "Event" e
    LEFT JOIN "User" au ON au."id" = e."assignedUserId"
    LEFT JOIN "User" cu ON cu."id" = e."chaperoneUserId"
    LEFT JOIN "User" pu ON pu."id" = e."pickupUserId"
    LEFT JOIN "KidProfile" kp ON kp."id" = e."kidProfileId"
    WHERE e."familyGroupId" = ${context.familyId}
      AND e."startTime" >= ${start} AND e."startTime" < ${end}
      AND (${seeAll} OR e."assignedUserId" = ${context.userId} OR e."chaperoneUserId" = ${context.userId}
        OR e."pickupUserId" = ${context.userId} OR (${kidProfileId !== null} AND e."kidProfileId" = ${kidProfileId}))
    ORDER BY e."startTime" ASC
  `;
  return NextResponse.json(events);
}
