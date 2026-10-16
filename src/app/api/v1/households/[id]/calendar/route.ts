import { NextRequest } from "next/server";
import { ApiError, guard, json, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { dateTimeFromLocal, isCalendarDate } from "@/lib/datetime";
import { Permission } from "@/lib/domain";

export const dynamic = "force-dynamic";

// Il calendario versionato rispetta la visibilità: chi ha accesso limitato vede solo ciò che lo riguarda.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to || !isCalendarDate(from) || !isCalendarDate(to) || to <= from) {
      throw new ApiError(422, "validation_error", "Servono i parametri from e to come date (YYYY-MM-DD), con to successivo a from.");
    }

    const start = dateTimeFromLocal(from, "00:00", membership.family.timezone);
    const end = dateTimeFromLocal(to, "00:00", membership.family.timezone);
    const seeAll = membership.permission !== Permission.MEMBER;

    const events = await db`
      SELECT e."id", e."title", e."description", e."location", e."startTime", e."endTime", e."category", e."status",
        e."assignedUserId", e."chaperoneUserId", e."pickupUserId", e."kidProfileId",
        CASE WHEN au."id" IS NULL THEN NULL ELSE jsonb_build_object('id', au."id", 'name', au."name", 'avatarColor', au."avatarColor") END AS "assignedUser"
      FROM "Event" e
      LEFT JOIN "User" au ON au."id" = e."assignedUserId"
      WHERE e."familyGroupId" = ${membership.familyGroupId}
        AND e."startTime" >= ${start} AND e."startTime" < ${end}
        AND (${seeAll} OR e."assignedUserId" = ${userId} OR e."chaperoneUserId" = ${userId} OR e."pickupUserId" = ${userId})
      ORDER BY e."startTime" ASC
    `;

    return json({ from, to, timezone: membership.family.timezone, events });
  });
}
