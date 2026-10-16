import Link from "next/link";
import { AppPage } from "@/components/app-page";
import { ImpactSimulator, type SimActivity } from "@/components/impact-simulator";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { loadMembers, loadWorkload, weekRange } from "@/lib/insights";
import { LOAD_DIMENSIONS } from "@/lib/categories";
import { CAPACITY_META, Category, Flexibility } from "@/lib/domain";
import { formatMinutes } from "@/lib/workload";

export const dynamic = "force-dynamic";

const periodFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export default async function WorkloadPage() {
  const context = await getFamilyContext();
  const period = weekRange(new Date());
  const [{ report }, members, activities] = await Promise.all([
    loadWorkload(context.familyId, period),
    loadMembers(context.familyId),
    db`
      SELECT t."id", t."title", t."category", t."estimatedMinutes", t."preparationMinutes", t."travelMinutes",
        t."coordinationMinutes", t."flexibility", t."rotates", t."assignedToId", u."name" AS "assignedToName"
      FROM "Task" t LEFT JOIN "User" u ON u."id" = t."assignedToId"
      WHERE t."familyGroupId" = ${context.familyId} AND t."activityStatus" NOT IN ('completed', 'skipped', 'cancelled')
      ORDER BY t."dueAt" ASC NULLS LAST LIMIT 40
    `,
  ]);

  const canAssign = context.capabilities.has("task.assign");
  const seeDetail = context.capabilities.has("workload.read_detail");
  const maxMinutes = Math.max(1, ...report.members.map((member) => member.totalMinutes));
  const openCount = report.members.reduce((sum, member) => sum + member.openCount, 0);

  const simActivities: SimActivity[] = activities.map((activity) => ({
    id: activity.id as string,
    title: activity.title as string,
    category: activity.category as Category,
    estimatedMinutes: (activity.estimatedMinutes as number) ?? 30,
    preparationMinutes: (activity.preparationMinutes as number) ?? 0,
    travelMinutes: (activity.travelMinutes as number) ?? 0,
    coordinationMinutes: (activity.coordinationMinutes as number) ?? 0,
    flexibility: (activity.flexibility as Flexibility) ?? "flexible",
    rotates: Boolean(activity.rotates),
    assignedToName: (activity.assignedToName as string | null) ?? null,
  }));

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>Il carico, reso visibile.</h1>
            <p>Non tutto il lavoro si vede: cura, coordinamento e reperibilità contano quanto il resto. Settimana del {periodFormat.format(period.start)}.</p>
          </div>
          <Link className="outline-button" href="/scenarios">Scenario room</Link>
        </div>

        <div className="kpi-row">
          <div className="kpi"><strong>{formatMinutes(report.totalMinutes)}</strong><span>Carico totale del nucleo</span></div>
          <div className="kpi"><strong>{report.concentration}%</strong><span>Concentrazione (0 = equilibrato)</span></div>
          <div className="kpi"><strong>{formatMinutes(report.coordinationMinutes)}</strong><span>Tempo di coordinamento</span></div>
          <div className="kpi"><strong>{report.unassignedCount}</strong><span>Senza responsabile</span></div>
        </div>

        <section className="panel">
          <div className="panel-heading"><div><h2>Segnali della settimana</h2><p>Indizi da discutere insieme. Nessuna classifica, nessun giudizio.</p></div></div>
          {report.signals.length ? (
            <div className="signal-list">
              {report.signals.map((signal) => (
                <div className={`signal ${signal.tone}`} key={signal.id}>
                  <span className="signal-icon">✳</span>
                  <div><strong>{signal.title}</strong><p>{signal.detail}</p></div>
                </div>
              ))}
            </div>
          ) : <div className="empty-inline">Nessun segnale critico: il carico di questa settimana appare sostenibile.</div>}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><h2>Carico per persona</h2><p>Le cinque dimensioni del lavoro, secondo per secondo.</p></div>
            <div className="legend">
              {LOAD_DIMENSIONS.map((dimension) => (
                <span className="legend-item" key={dimension.key}><span className="legend-swatch" style={{ background: dimension.color }} />{dimension.label}</span>
              ))}
            </div>
          </div>
          <div className="load-grid">
            {report.members.map((member) => {
              const info = members.find((entry) => entry.userId === member.userId);
              const visible = seeDetail || member.userId === context.userId;
              return (
                <article className="load-member" key={member.userId}>
                  <div className="load-member-head">
                    <span className="person-avatar" style={{ background: member.color }}>{member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                    <div>
                      <span className="person-name">{member.name}</span>
                      <span className="person-sub">{info?.roleName ?? ""} · {member.activityCount} attività · {member.openCount} aperte</span>
                    </div>
                    <span className="load-total">{formatMinutes(member.totalMinutes)}</span>
                  </div>

                  <span className={`capacity-chip capacity-${member.capacity}`}>{CAPACITY_META[member.capacity].label}</span>

                  <div className="load-bars" style={{ marginTop: 10 }}>
                    {LOAD_DIMENSIONS.map((dimension) => {
                      const minutes = member.minutes[dimension.key];
                      const width = member.totalMinutes > 0 ? (minutes / member.totalMinutes) * 100 : 0;
                      return <span key={dimension.key} style={{ width: `${width}%`, background: dimension.color }} title={`${dimension.label}: ${formatMinutes(minutes)}`} />;
                    })}
                  </div>

                  {visible ? (
                    <div className="load-dimensions">
                      {LOAD_DIMENSIONS.map((dimension) => {
                        const minutes = member.minutes[dimension.key];
                        const width = (minutes / maxMinutes) * 100;
                        return (
                          <div className="dim-row" key={dimension.key}>
                            <span className="dim-label">{dimension.label}</span>
                            <span className="meter"><span className="meter-fill" style={{ width: `${width}%`, background: dimension.color }} /></span>
                            <span className="dim-value">{formatMinutes(minutes)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted-note" style={{ marginTop: 10 }}>Il dettaglio del carico altrui è visibile solo a chi ha il permesso dedicato. Qui vedi il totale aggregato.</p>
                  )}

                  <p className="muted-note" style={{ marginTop: 10 }}>Quota sul carico del nucleo: {Math.round(member.share * 100)}%</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Simula l'impatto di una scelta</h2><p>Scegli un'attività e guarda cosa cambierebbe per ciascuna persona, prima di decidere.</p></div></div>
          <ImpactSimulator activities={simActivities} canAssign={canAssign} />
        </section>

        <p className="muted-note" style={{ marginTop: 13 }}>
          {openCount} attività aperte questa settimana. Il carico non è una gara: è ciò che rende possibile la vita del nucleo.
        </p>
      </div>
    </AppPage>
  );
}
