import { Permission, RoleKey } from "@/lib/domain";
import { redirect } from "next/navigation";
import { AppPage } from "@/components/app-page";
import { AddKidForm, CopyInviteButton, LinkKidForm, WorkScheduleForm } from "@/components/family-tools";
import { AccessManager, type AccessMember, type MemberInvitation } from "@/components/access-manager";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { effectivePermissions } from "@/lib/permissions";
import { ROLE_META } from "@/lib/domain";

export const dynamic = "force-dynamic";

const permissionLabel: Record<Permission, string> = { ADMIN: "Amministrazione", HELPER: "Coordinamento", MEMBER: "Accesso limitato" };

export default async function FamilyPage() {
  const context = await getFamilyContext();
  if (!context.isAdmin) redirect("/careboard");
  const [members, kids, users, invitationRows] = await Promise.all([
    db`
      SELECT fm."id", fm."userId", fm."roleName", fm."permission", fm."roleKey", fm."permissions", fm."kidProfileId",
        u."name", u."email", u."avatarColor"
      FROM "FamilyMember" fm JOIN "User" u ON u."id" = fm."userId"
      WHERE fm."familyGroupId" = ${context.familyId} AND fm."status" = 'active'
      ORDER BY fm."joinedAt" ASC
    `,
    db`
      SELECT "id", "name", "birthDate", "avatarColor" FROM "KidProfile"
      WHERE "familyGroupId" = ${context.familyId} ORDER BY "createdAt" ASC
    `,
    db`SELECT "workSchedule" FROM "User" WHERE "id" = ${context.userId} LIMIT 1`,
    db`
      SELECT "id", "label", "roleKey", "shortCode", "maxUses", "uses", "expiresAt", "revokedAt"
      FROM "Invitation"
      WHERE "familyGroupId" = ${context.familyId} AND "revokedAt" IS NULL AND "uses" < "maxUses"
      ORDER BY "createdAt" DESC LIMIT 12
    `,
  ]);
  const currentUser = users[0];

  const accessMembers: AccessMember[] = members.map((member) => {
    const roleKey = (member.roleKey as RoleKey) ?? "member";
    const granted = [...effectivePermissions({ permission: member.permission as Permission, roleKey, permissions: (member.permissions ?? {}) as Record<string, boolean> })];
    return {
      id: member.id as string,
      userId: member.userId as string,
      name: member.name as string,
      email: member.email as string,
      color: (member.avatarColor as string) ?? "#7855dc",
      roleKey,
      roleName: member.roleName as string,
      permission: member.permission as Permission,
      granted,
      isMe: member.userId === context.userId,
    };
  });

  const now = Date.now();
  const invitations: MemberInvitation[] = invitationRows.map((row) => {
    const expiresAt = new Date(row.expiresAt as string);
    const expired = expiresAt.getTime() < now;
    return {
      id: row.id as string,
      label: (row.label as string | null) ?? null,
      roleKey: (row.roleKey as RoleKey) ?? "member",
      shortCode: row.shortCode as string,
      roleLabel: ROLE_META[(row.roleKey as RoleKey) ?? "member"]?.label ?? "Componente",
      usesLabel: `${row.uses} / ${row.maxUses} utilizzi`,
      expiresLabel: expired ? "Scaduto" : `Scade il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(expiresAt)}`,
      expired,
    };
  });

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading"><div><h1>Il vostro nucleo</h1><p>Una rete flessibile, costruita intorno a chi c&apos;è davvero.</p></div><span className="role-pill">{context.membership.roleName} · {permissionLabel[context.membership.permission]}</span></div>

        <section className="panel">
          <div className="panel-heading"><div><h2>Invita la tua rete</h2><p>Condividi il codice solo con le persone che vuoi aggiungere.</p></div></div>
          <div className="invite-section"><span className="invite-code">{context.family.inviteCode}</span><CopyInviteButton inviteCode={context.family.inviteCode} /><span className="invite-help">Chi si unisce sceglie il proprio nome e livello di accesso.</span></div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Persone e profili</h2><p>Adulti, tutori, caregiver e persone di fiducia. Collega un account a un profilo assistito quando serve.</p></div><span className="count-badge">{members.length}</span></div>
          <div className="table-scroll">
            {accessMembers.map((member) => (
              <div className="member-row" key={member.id}>
                <div className="member-info"><span className="avatar" style={{ background: member.color }}>{member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div>
                <span className="role-pill">{ROLE_META[member.roleKey]?.label ?? member.roleName}</span>
                <LinkKidForm memberId={member.id} kidProfileId={(members.find((entry) => entry.id === member.id)?.kidProfileId as string | null) ?? null} kids={kids.map((kid) => ({ id: kid.id as string, name: kid.name as string }))} />
                <span className="muted-note">{member.granted.length} permessi attivi</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Ruoli, permessi e inviti</h2><p>Il ruolo di una persona dice cosa può fare, mai chi è. I permessi si rifiniscono uno per uno.</p></div></div>
          <AccessManager members={accessMembers} invitations={invitations} />
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Profili dei figli</h2><p>Ogni profilo ha il suo calendario, colore e impegni.</p></div><span className="count-badge">{kids.length}</span></div>
          {!kids.length && <p className="muted-copy">Non ci sono ancora profili. Potrai aggiungerli qui.</p>}
          {kids.map((kid) => <div className="kid-card" key={kid.id as string}><span className="avatar" style={{ background: kid.avatarColor as string }}>{(kid.name as string).trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase()}</span><span><strong>{kid.name as string}</strong><small>{kid.birthDate ? `Nato/a il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(kid.birthDate as string))}` : "Profilo familiare"}</small></span></div>)}
          <div className="kid-add-wrap"><AddKidForm /></div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>I tuoi orari e turni</h2><p>Segna le fasce in cui non sei disponibile: saranno considerate nei suggerimenti di assegnazione.</p></div></div>
          <WorkScheduleForm schedule={currentUser?.workSchedule} />
        </section>
      </div>
    </AppPage>
  );
}
