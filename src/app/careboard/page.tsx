import Link from "next/link";
import { AppPage } from "@/components/app-page";
import { CheckinCard } from "@/components/checkin-card";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { categoryColor, loadMembers, loadWorkload, weekRange } from "@/lib/insights";
import { CAPACITY_META, Category, Capacity } from "@/lib/domain";
import { formatMinutes } from "@/lib/workload";
import { addCalendarDays, dateKey, italianDate } from "@/lib/format";
import { dateTimeFromLocal } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

export default async function CareboardPage() {
  const context = await getFamilyContext();
  const seeAll = context.membership.permission !== "MEMBER";
  const kidProfileId = context.membership.kidProfileId;

  const today = new Date();
  const todayKey = dateKey(today);
  const tomorrowKey = dateKey(addCalendarDays(today, 1));
  const dayStart = dateTimeFromLocal(todayKey, "00:00", context.family.timezone);
  const dayEnd = dateTimeFromLocal(tomorrowKey, "00:00", context.family.timezone);

  const [members, workload, events, tasks, openRequests, checkIns, inboxRows] = await Promise.all([
    loadMembers(context.familyId),
    loadWorkload(context.familyId, weekRange(today)),
    db`
      SELECT e."id", e."title", e."startTime", e."endTime", e."category",
        u."name" AS "assigneeName", kp."name" AS "kidName"
      FROM "Event" e
      LEFT JOIN "User" u ON u."id" = e."assignedUserId"
      LEFT JOIN "KidProfile" kp ON kp."id" = e."kidProfileId"
      WHERE e."familyGroupId" = ${context.familyId} AND e."startTime" >= ${dayStart} AND e."startTime" < ${dayEnd}
        AND (${seeAll} OR e."assignedUserId" = ${context.userId} OR e."chaperoneUserId" = ${context.userId}
          OR e."pickupUserId" = ${context.userId} OR (${kidProfileId !== null} AND e."kidProfileId" = ${kidProfileId}))
      ORDER BY e."startTime" ASC
    `,
    db`
      SELECT t."id", t."title", t."dueAt", t."category", t."activityStatus", u."name" AS "assigneeName"
      FROM "Task" t LEFT JOIN "User" u ON u."id" = t."assignedToId"
      WHERE t."familyGroupId" = ${context.familyId} AND t."dueAt" >= ${dayStart} AND t."dueAt" < ${dayEnd}
        AND t."activityStatus" NOT IN ('completed', 'skipped', 'cancelled')
        AND (${seeAll} OR t."assignedToId" = ${context.userId})
      ORDER BY t."dueAt" ASC
    `,
    db`
      SELECT r."id", r."message", r."reasonType", r."createdAt", u."name" AS "authorName"
      FROM "SupportRequest" r JOIN "User" u ON u."id" = r."createdById"
      WHERE r."familyGroupId" = ${context.familyId} AND r."status" = 'open'
        AND (${seeAll} OR r."createdById" = ${context.userId})
      ORDER BY r."createdAt" DESC LIMIT 4
    `,
    db`
      SELECT "capacity", "stress", "shareLevel", "note", "recordedFor"
      FROM "CheckIn"
      WHERE "familyGroupId" = ${context.familyId} AND "userId" = ${context.userId} AND "kind" = 'daily'
      ORDER BY "recordedFor" DESC LIMIT 1
    `,
    db`
      SELECT COUNT(*)::int AS "count" FROM "InboxItem"
      WHERE "familyGroupId" = ${context.familyId} AND "status" = 'pending_review'
    `,
  ]);

  const checkIn = checkIns[0];
  const timeline = [
    ...events.map((event) => ({
      id: event.id as string,
      kind: "event" as const,
      title: event.title as string,
      at: new Date(event.startTime as string),
      end: new Date(event.endTime as string),
      category: event.category as Category,
      person: (event.assigneeName as string | null) ?? (event.kidName as string | null) ?? null,
    })),
    ...tasks.map((task) => ({
      id: task.id as string,
      kind: "task" as const,
      title: task.title as string,
      at: task.dueAt ? new Date(task.dueAt as string) : null,
      end: null,
      category: task.category as Category,
      person: (task.assigneeName as string | null) ?? null,
    })),
  ].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

  const hour = today.getHours();
  const greeting = hour < 6 ? "Buonanotte" : hour < 13 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";
  const firstName = context.membership.roleName.split(/\s+/)[0];
  const report = workload.report;
  const pendingCount = (inboxRows[0]?.count as number) ?? 0;
  const openCount = report.members.reduce((sum, member) => sum + member.openCount, 0);

  return (
    <AppPage>
      <div className="content-page">
        <div className="cb-hello">
          <div>
            <p className="eyebrow">{italianDate.format(today)}</p>
            <h1>{greeting}, <em>{firstName}</em></h1>
            <p>Questa è la giornata del vostro nucleo: impegni, segnali di carico e decisioni da prendere insieme.</p>
          </div>
          <div className="cb-hello-actions">
            <Link className="primary-button" href="/tasks">＋ Nuova attività</Link>
            <Link className="outline-button" href="/inbox">Apri care inbox</Link>
          </div>
        </div>

        <div className="cb-grid">
          <div>
            <section className="cb-card">
              <div className="cb-card-head">
                <div><h2>Oggi</h2><p>{timeline.length ? `${timeline.length} momenti tra impegni e attività.` : "Nessun impegno fissato per oggi."}</p></div>
                <Link className="chip chip-purple" href="/calendar">Calendario</Link>
              </div>
              {timeline.length ? (
                <div className="today-list">
                  {timeline.map((entry) => (
                    <div className="today-item" key={`${entry.kind}-${entry.id}`}>
                      <span className="today-time">{entry.at ? timeFormat.format(entry.at) : "—"}</span>
                      <span className="today-stripe" style={{ background: categoryColor(entry.category) }} />
                      <span>
                        <span className="today-title">{entry.title}</span>
                        <span className="today-meta">{entry.kind === "event" ? "Evento" : "Attività"}{entry.person ? ` · ${entry.person}` : " · senza responsabile"}</span>
                      </span>
                      <span className="chip chip-neutral">{entry.category}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">Oggi è una pagina bianca. Puoi riempirla con calma, o lasciarla così.</div>
              )}
            </section>

            <section className="cb-card">
              <div className="cb-card-head">
                <div><h2>Segnali di carico</h2><p>Servono a parlarne, non a giudicare chi fa di più.</p></div>
                <Link className="chip chip-purple" href="/workload">Pannello del carico</Link>
              </div>
              {report.signals.length ? (
                <div className="signal-list">
                  {report.signals.slice(0, 4).map((signal) => (
                    <div className={`signal ${signal.tone}`} key={signal.id}>
                      <span className="signal-icon">✳</span>
                      <div><strong>{signal.title}</strong><p>{signal.detail}</p></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">Nessun segnale critico questa settimana. Il carico sembra sostenibile.</div>
              )}
            </section>

            <section className="cb-card">
              <div className="cb-card-head">
                <div><h2>Richieste di aiuto aperte</h2><p>Un bisogno espresso è un problema che non esplode più tardi.</p></div>
                <Link className="chip chip-purple" href="/support">Tutte</Link>
              </div>
              {openRequests.length ? (
                openRequests.map((request) => (
                  <div className="support-card open" key={request.id}>
                    <div className="inbox-item-head"><strong>{request.authorName}</strong><span className="chip chip-warn">{String(request.reasonType).replace(/_/g, " ")}</span></div>
                    <p className="support-quote">{request.message}</p>
                    <Link className="outline-button small-button" href="/support">Rispondi</Link>
                  </div>
                ))
              ) : (
                <div className="empty-inline">Nessuna richiesta di aiuto in sospeso. Se ti serve una mano, puoi chiederla in qualsiasi momento.</div>
              )}
            </section>
          </div>

          <div>
            <CheckinCard
              current={checkIn ? {
                capacity: (checkIn.capacity as Capacity) ?? Capacity.NORMAL,
                stress: (checkIn.stress as number | null) ?? null,
                shareLevel: (checkIn.shareLevel as string) ?? "band",
                note: (checkIn.note as string | null) ?? null,
                updatedLabel: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(checkIn.recordedFor as string)),
              } : null}
            />

            <section className="cb-card">
              <div className="cb-card-head">
                <div><h2>Le persone</h2><p>La capacità dichiarata orienta i suggerimenti.</p></div>
                <Link className="chip chip-purple" href="/family">Nucleo</Link>
              </div>
              {members.map((member) => (
                <div className="person-row" key={member.membershipId}>
                  <span className="person-avatar" style={{ background: member.color }}>{member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <span className="person-grow"><span className="person-name">{member.name}</span><span className="person-sub">{member.roleName}{member.kidProfileId ? " · profilo assistito" : ""}</span></span>
                  <span className={`capacity-chip capacity-${member.capacity}`}>{CAPACITY_META[member.capacity].label}</span>
                </div>
              ))}
            </section>

            <section className="cb-card">
              <div className="cb-card-head"><div><h2>Questa settimana</h2><p>Numeri per orientarsi, non per competere.</p></div></div>
              <div className="kpi-row">
                <div className="kpi"><strong>{formatMinutes(report.totalMinutes)}</strong><span>Carico totale del nucleo</span></div>
                <div className="kpi"><strong>{report.concentration}%</strong><span>Concentrazione (0 = equilibrato)</span></div>
                <div className="kpi"><strong>{openCount}</strong><span>Attività ancora aperte</span></div>
                <div className="kpi"><strong>{report.unassignedCount}</strong><span>Senza responsabile</span></div>
              </div>
              <div className="cb-hello-actions" style={{ marginTop: 13 }}>
                <Link className="outline-button small-button" href="/scenarios">Scenario room</Link>
                <Link className="outline-button small-button" href="/summary">Riepilogo{pendingCount ? ` · ${pendingCount} in inbox` : ""}</Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
