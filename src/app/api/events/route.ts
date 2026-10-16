import { NextRequest, NextResponse } from "next/server";
import { dateTimeFromLocal } from "@/lib/datetime";
import { getFamilyContext } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(request: NextRequest) {
  const context = await getFamilyContext();
  const from = dateSchema.safeParse(request.nextUrl.searchParams.get("from"));
  const to = dateSchema.safeParse(request.nextUrl.searchParams.get("to"));
  if (!from.success || !to.success || to.data <= from.data) {
    return NextResponse.json({ error: "Intervallo di date non valido." }, { status: 400 });
  }

  const start = dateTimeFromLocal(from.data, "00:00", context.family.timezone);
  const end = dateTimeFromLocal(to.data, "00:00", context.family.timezone);
  const visibility = context.membership.permission === "MEMBER"
    ? {
        OR: [
          { assignedUserId: context.userId },
          { chaperoneUserId: context.userId },
          { pickupUserId: context.userId },
          ...(context.membership.kidProfileId ? [{ kidProfileId: context.membership.kidProfileId }] : []),
        ],
      }
    : {};
  const events = await prisma.event.findMany({
    where: { familyGroupId: context.familyId, startTime: { gte: start, lt: end }, ...visibility },
    orderBy: { startTime: "asc" },
    include: {
      assignedUser: { select: { id: true, name: true, avatarColor: true } },
      chaperoneUser: { select: { id: true, name: true } },
      pickupUser: { select: { id: true, name: true } },
      kidProfile: { select: { id: true, name: true, avatarColor: true } },
    },
  });
  return NextResponse.json(events);
}
