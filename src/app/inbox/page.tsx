import { AppPage } from "@/components/app-page";
import { CareInbox, type InboxDraft } from "@/components/care-inbox";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai/orchestrator";
import type { ResolvedItem } from "@/lib/ai/orchestrator";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const context = await getFamilyContext();
  const canConfirm = context.capabilities.has("task.assign");
  const rows = await db`
    SELECT i."id", i."rawText", i."proposed", i."confidence", i."explanation", i."createdAt", u."name" AS "authorName"
    FROM "InboxItem" i JOIN "User" u ON u."id" = i."createdById"
    WHERE i."familyGroupId" = ${context.familyId} AND i."status" = 'pending_review'
    ORDER BY i."createdAt" DESC LIMIT 20
  `;

  const drafts: InboxDraft[] = rows.map((row) => {
    const proposed = (row.proposed ?? {}) as { items?: ResolvedItem[] };
    const items = proposed.items ?? [];
    return {
      id: row.id as string,
      rawText: row.rawText as string,
      createdAtLabel: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt as string)),
      authorName: (row.authorName as string) ?? "Qualcuno",
      confidence: (row.confidence as number) ?? 0,
      explanation: (row.explanation as string | null) ?? null,
      items: items.map((item) => ({
        kind: item.kind,
        title: item.title,
        category: item.category,
        startIso: item.startIso,
        endIso: item.endIso,
        estimatedMinutes: item.estimated_minutes,
        assigneeName: item.assigneeName,
        location: item.location,
        notes: item.notes,
        missing: item.missing_information ?? [],
      })),
    };
  });

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>Care inbox.</h1>
            <p>Il lavoro mentale inizia prima: leggere, capire, ricordare. Qui il testo diventa un piano, con il tuo permesso.</p>
          </div>
          <span className="role-pill">{drafts.length} {drafts.length === 1 ? "bozza" : "bozze"}</span>
        </div>
        <CareInbox drafts={drafts} configured={isAiConfigured()} canConfirm={canConfirm} />
      </div>
    </AppPage>
  );
}
