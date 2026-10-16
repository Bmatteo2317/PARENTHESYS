import { AppPage } from "@/components/app-page";
import { PrivacyTools } from "@/components/privacy-tools";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const context = await getFamilyContext();
  const audit = await db`
    SELECT a."action", a."entityType", a."createdAt", u."name" AS "actorName"
    FROM "AuditLog" a LEFT JOIN "User" u ON u."id" = a."actorUserId"
    WHERE a."familyGroupId" = ${context.familyId}
    ORDER BY a."createdAt" DESC LIMIT 30
  `;

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>Privacy e dati.</h1>
            <p>Un planner di famiglia tocca la vita intima. Qui il controllo resta nelle tue mani.</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-heading"><div><h2>I nostri impegni</h2><p>Regole semplici, applicate al codice e non solo promesse.</p></div></div>
          <ul className="privacy-points">
            <li>Il check-in sulla capacità è volontario e revocabile: nessun obbligo, nessuno storico nascosto.</li>
            <li>I segnali di carico non sono classifiche e non dicono chi fa "di più": indicano dove parlare.</li>
            <li>Prima di raggiungere il modello AI, i nomi vengono sostituiti con token e mai restituiti.</li>
            <li>Ogni decisione importante è tracciata in un registro verificabile, con autore e momento.</li>
            <li>Puoi esportare o cancellare i tuoi dati, e lasciare il nucleo in qualsiasi momento.</li>
          </ul>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>I tuoi controlli</h2><p>Esportazione, cancellazione e uscita dal nucleo.</p></div></div>
          <PrivacyTools canExportHousehold={context.capabilities.has("data.export")} canDeleteHousehold={context.capabilities.has("data.delete")} />
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Registro delle attività</h2><p>Chi ha fatto cosa e quando: trasparenza, non sorveglianza.</p></div></div>
          {audit.length ? (
            <div className="audit-list">
              {audit.map((entry, index) => (
                <div className="audit-row" key={index}>
                  <span className="audit-time">{new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt as string))}</span>
                  <span className="audit-actor">{(entry.actorName as string) ?? "Sistema"}</span>
                  <span className="audit-action">{(entry.action as string).replace(/\./g, " · ")}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty-inline">Ancora nessuna attività registrata.</div>}
        </section>
      </div>
    </AppPage>
  );
}
