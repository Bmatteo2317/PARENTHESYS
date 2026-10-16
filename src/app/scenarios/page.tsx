import { AppPage } from "@/components/app-page";
import { ScenarioRoom, type SavedScenario } from "@/components/scenario-room";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { loadScenarioVariants, weekRange } from "@/lib/insights";

export const dynamic = "force-dynamic";

const periodFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export default async function ScenariosPage() {
  const context = await getFamilyContext();
  const period = weekRange(new Date());
  const canSave = context.capabilities.has("task.assign");
  const [variants, savedRows] = await Promise.all([
    loadScenarioVariants(context.familyId, period),
    db`
      SELECT s."id", s."name", s."question", s."createdAt",
        (SELECT COUNT(*)::int FROM "ScenarioVariant" v WHERE v."scenarioId" = s."id") AS "variantCount"
      FROM "Scenario" s
      WHERE s."familyGroupId" = ${context.familyId}
      ORDER BY s."createdAt" DESC LIMIT 12
    `,
  ]);

  const saved: SavedScenario[] = savedRows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    question: (row.question as string | null) ?? null,
    createdAtLabel: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt as string)),
    variantCount: row.variantCount as number,
  }));

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>Scenario room.</h1>
            <p>Cinque modi di vivere la stessa settimana. Settimana del {periodFormat.format(period.start)}. Qui non si vince: si sceglie con consapevolezza.</p>
          </div>
        </div>
        <ScenarioRoom variants={variants} saved={saved} canSave={canSave} />
      </div>
    </AppPage>
  );
}
