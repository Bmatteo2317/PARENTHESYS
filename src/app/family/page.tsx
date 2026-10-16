import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";
import { AppPage } from "@/components/app-page";
import { AddKidForm, CopyInviteButton, LinkKidForm, MemberRoleForm, WorkScheduleForm } from "@/components/family-tools";
import { getFamilyContext } from "@/lib/family";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const permissionLabel: Record<Permission, string> = { ADMIN: "Genitore / Tutore", HELPER: "Rete di supporto", MEMBER: "Membro" };

export default async function FamilyPage() {
  const context = await getFamilyContext();
  if (context.membership.permission === "MEMBER") redirect("/calendar");
  const [members, kids, currentUser] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyGroupId: context.familyId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true } },
        kidProfile: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.kidProfile.findMany({ where: { familyGroupId: context.familyId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findUnique({ where: { id: context.userId }, select: { workSchedule: true } }),
  ]);

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading"><div><h1>La vostra famiglia</h1><p>Una rete flessibile, costruita intorno a chi c’è davvero.</p></div><span className="role-pill">{context.membership.roleName} · {permissionLabel[context.membership.permission]}</span></div>
        <section className="panel">
          <div className="panel-heading"><div><h2>Invita la tua rete</h2><p>Condividi il codice solo con le persone che vuoi aggiungere.</p></div></div>
          <div className="invite-section"><span className="invite-code">{context.family.inviteCode}</span><CopyInviteButton inviteCode={context.family.inviteCode} /><span className="invite-help">Chi si unisce sceglie il proprio nome e livello di accesso.</span></div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Adulti e rete di supporto</h2><p>Genitori, tutori, caregiver e persone di fiducia, senza ruoli predefiniti.</p></div><span className="count-badge">{members.length}</span></div>
          <div className="table-scroll">
            {members.map((member) => <div className="member-row" key={member.id}>
              <div className="member-info"><span className="avatar" style={{ background: member.user.avatarColor }}>{member.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span><strong>{member.user.name}</strong><small>{member.user.email}</small></span></div>
              <span className="role-pill">{permissionLabel[member.permission]}</span>
              {context.isAdmin && <>
                <LinkKidForm memberId={member.id} kidProfileId={member.kidProfileId} kids={kids.map((kid) => ({ id: kid.id, name: kid.name }))} />
                <MemberRoleForm member={{ id: member.id, roleName: member.roleName, permission: member.permission }} />
              </>}
            </div>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Profili dei figli</h2><p>Ogni profilo ha il suo calendario, colore e impegni.</p></div><span className="count-badge">{kids.length}</span></div>
          {!kids.length && <p className="muted-copy">Non ci sono ancora profili. Potrai aggiungerli qui.</p>}
          {kids.map((kid) => <div className="kid-card" key={kid.id}><span className="avatar" style={{ background: kid.avatarColor }}>{kid.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span><strong>{kid.name}</strong><small>{kid.birthDate ? `Nato/a il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(kid.birthDate)}` : "Profilo familiare"}</small></span></div>)}
          {context.isAdmin && <div className="kid-add-wrap"><AddKidForm /></div>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>I tuoi orari e turni</h2><p>Segna le fasce in cui non sei disponibile: saranno considerate nei suggerimenti di assegnazione.</p></div></div>
          <WorkScheduleForm schedule={currentUser?.workSchedule} />
        </section>
      </div>
    </AppPage>
  );
}
