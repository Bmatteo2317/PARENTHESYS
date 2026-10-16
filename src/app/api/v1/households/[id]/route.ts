import { NextRequest } from "next/server";
import { guard, json, requireUser, resolveHousehold } from "@/lib/api";
import { db } from "@/lib/db";
import { loadMembers } from "@/lib/insights";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);

    const members = await loadMembers(membership.familyGroupId);
    // I profili assistiti (minori e persone curate) escono solo con il permesso dedicato.
    const canReadCare = membership.capabilities.has("care.read_sensitive");
    const careProfiles = canReadCare
      ? await db`
          SELECT kp."id", kp."name", kp."birthDate", kp."avatarColor", kp."kind"
          FROM "KidProfile" kp
          WHERE kp."familyGroupId" = ${membership.familyGroupId}
          ORDER BY kp."createdAt" ASC
        `
      : [];

    return json({
      household: membership.family,
      you: {
        membershipId: membership.membershipId,
        roleKey: membership.roleKey,
        permission: membership.permission,
        isAdmin: membership.isAdmin,
        capabilities: [...membership.capabilities],
      },
      members: members.map((member) => ({
        userId: member.userId,
        name: member.name,
        roleKey: member.roleKey,
        roleName: member.roleName,
        permission: member.permission,
        color: member.color,
        capacity: member.capacity,
        joinedAt: member.joinedAt,
      })),
      careProfiles,
      careProfilesVisible: canReadCare,
    });
  });
}
