import { AppPage } from "@/components/app-page";
import { AiSummary } from "@/components/ai-summary";
import { getFamilyContext } from "@/lib/family";
import { loadWorkload, weekRange } from "@/lib/insights";
import { isAiConfigured } from "@/lib/ai/orchestrator";
import { formatMinutes } from "@/lib/workload";
import { CAPACITY_META } from "@/lib/domain";

export const dynamic = "force-dynamic";

const periodFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export default async function SummaryPage() {
  const context = await getFamilyContext();
  const period = weekRange(new Date());
  const { report, members, items } = await loadWorkload(context.familyId, period);

  const events = items.filter((item) => item.kind === "event").length;
  const tasks = items.filter((item) => item.kind === "task").length;
  const completed = items.filter((item) => !item.open).length;
  const dimensions = report.members.reduce(
    (acc, member) => ({
      operational: acc.operational + member.minutes.operationalMinutes,
      care: acc.care + member.minutes.careMinutes,
      household: acc.household + member.minutes.householdMinutes,
      coordination: acc.coordination + member.minutes.coordinationMinutes,
      onCall: acc.onCall + member.minutes.onCallMinutes,
    }),
    { operational: 0, care: 0, household: 0, coordination: 0, onCall: 0 },
  );

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>La settimana in parole.</h1>
            <p>Uno sguardo d'insieme, senza classifiche. Settimana del {periodFormat.format(period.start)}.</p>
          </div>
        </div>

        <section className="summary-block">
          <h2 className="summary-headline">Questa settimana il vostro nucleo ha coordinato {formatMinutes(report.totalMinutes)} di lavoro.</h2>
          <div className="summary-section">
            <h3>Cosa è successo</h3>
            <ul>
              <li>{events} {events === 1 ? "evento in calendario" : "eventi in calendario"} e {tasks} {tasks === 1 ? "attività" : "attività"} nel piano.</li>
              <li>{completed} {completed === 1 ? "voce già conclusa" : "voci già concluse"}; {report.unassignedCount} ancora senza un responsabile.</li>
              <li>{formatMinutes(report.coordinationMinutes)} spesi a prenotare, ricordare e verificare; {formatMinutes(report.onCallMinutes)} di reperibilità.</li>
            </ul>
          </div>

          <div className="summary-section">
            <h3>Come si distribuisce</h3>
            <ul>
              <li>Tempo operativo: {formatMinutes(dimensions.operational)} · Cura: {formatMinutes(dimensions.care)} · Casa: {formatMinutes(dimensions.household)}.</li>
              <li>Coordinamento: {formatMinutes(dimensions.coordination)} · Reperibilità: {formatMinutes(dimensions.onCall)}.</li>
              <li>Concentrazione del carico: {report.concentration}% (0 = distribuito in modo uniforme).</li>
            </ul>
          </div>

          <div className="summary-section">
            <h3>Carico per persona</h3>
            <ul>
              {report.members.map((member) => {
                const info = members.find((entry) => entry.userId === member.userId);
                return (
                  <li key={member.userId}>
                    {member.name}: {formatMinutes(member.totalMinutes)} ({Math.round(member.share * 100)}% del totale) · {member.activityCount} attività · capacità {CAPACITY_META[member.capacity].label}
                    {info?.stress != null ? ` · stress dichiarato ${info.stress}/5` : ""}.
                  </li>
                );
              })}
            </ul>
          </div>

          {report.signals.length > 0 && (
            <div className="summary-section">
              <h3>Segnali da tenere d'occhio</h3>
              <ul>{report.signals.map((signal) => <li key={signal.id}>{signal.title} — {signal.detail}</li>)}</ul>
            </div>
          )}
        </section>

        <div style={{ marginTop: 13 }}>
          <AiSummary configured={isAiConfigured()} />
        </div>
      </div>
    </AppPage>
  );
}
