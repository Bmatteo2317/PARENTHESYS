import { ApiError, guard, json, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => {
    const userId = await requireUser();

    const [user] = await db`
      SELECT "id", "name", "displayName", "email", "pronoun", "locale", "timeZone", "dateFormat", "avatarColor", "createdAt"
      FROM "User" WHERE "id" = ${userId} LIMIT 1
    `;
    if (!user) throw new ApiError(404, "not_found", "Utente non trovato.");

    // Le appartenenze raccontano in quali nuclei si è presenti: nessun dato di nuclei terzi.
    const memberships = await db`
      SELECT fm."id" AS "membershipId", fm."roleKey", fm."roleName", fm."permission", fm."status", fm."joinedAt",
        fg."id" AS "familyGroupId", fg."name" AS "familyName", fg."type", fg."timezone", fg."locale"
      FROM "FamilyMember" fm
      JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
      WHERE fm."userId" = ${userId} AND fm."status" = 'active'
      ORDER BY fm."joinedAt" ASC
    `;

    return json({ user, memberships });
  });
}
