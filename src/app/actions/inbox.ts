"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActivityStatus, Category, TaskStatus } from "@/lib/domain";
import { getFamilyContext, requirePermission } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { CATEGORY_META } from "@/lib/categories";
import { AiUnavailableError, type AiContext, extractCareItems, isAiConfigured, summariseWeek, type ResolvedItem } from "@/lib/ai/orchestrator";
import { buildWeeklySummaryInput, loadMembers, loadWorkload, weekRange } from "@/lib/insights";

async function buildContext(context: Awaited<ReturnType<typeof getFamilyContext>>): Promise<AiContext> {
  const [members, profiles] = await Promise.all([
    loadMembers(context.familyId),
    db`SELECT "id", "name" FROM "KidProfile" WHERE "familyGroupId" = ${context.familyId} ORDER BY "createdAt" ASC`,
  ]);
  return {
    familyGroupId: context.familyId,
    userId: context.userId,
    locale: context.family.locale,
    timeZone: context.family.timezone,
    now: new Date(),
    people: members.map((member) => ({ id: member.userId, name: member.name })),
    careProfiles: profiles.map((profile) => ({ id: profile.id as string, name: profile.name as string })),
    categories: Object.keys(CATEGORY_META),
  };
}

export type InboxResult = { ok: true; inboxItemId: string } | { ok: false; error: string };

// Il Care Orchestrator propone una bozza: non crea nulla finché una persona non conferma.
export async function extractInbox(formData: FormData): Promise<InboxResult> {
  const context = await requirePermission("event.create");
  const parsed = z.string().trim().min(4).max(4000).safeParse(formData.get("text"));
  if (!parsed.success) return { ok: false, error: "Incolla un testo un po' più lungo da interpretare." };
  if (!isAiConfigured()) {
    return { ok: false, error: "Il Care Orchestrator non è configurato: manca la chiave OpenRouter sul server." };
  }

  const aiContext = await buildContext(context);
  try {
    const result = await extractCareItems(parsed.data, aiContext);
    const [created] = await db`
      INSERT INTO "InboxItem" ("id", "familyGroupId", "createdById", "source", "rawText", "status", "proposed", "confidence", "explanation", "model")
      VALUES (gen_random_uuid()::text, ${context.familyId}, ${context.userId}, 'text', ${parsed.data}, 'pending_review',
        ${JSON.stringify({ items: result.items, peopleMentioned: result.peopleMentioned, redactions: result.redactions })}::jsonb,
        ${result.confidence}, ${result.explanation}, ${process.env.OPENROUTER_MODEL_FAST ?? "openai/gpt-4o-mini"})
      RETURNING "id"
    `;
    await writeAudit({
      familyGroupId: context.familyId,
      actorUserId: context.userId,
      action: "inbox.extract",
      entityType: "InboxItem",
      entityId: created.id as string,
      afterValue: { items: result.items.length, redactions: result.redactions },
    });
    revalidatePath("/inbox");
    return { ok: true, inboxItemId: created.id as string };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { ok: false, error: error.message };
    throw error;
  }
}

const resolveSchema = z.object({
  inboxItemId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

// Confermare la bozza è l'unico passaggio che scrive dati veri nel calendario.
export async function resolveInboxItem(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Decisione non valida.");
  const { inboxItemId, decision } = parsed.data;

  const [item] = await db`
    SELECT "id", "status", "proposed" FROM "InboxItem"
    WHERE "id" = ${inboxItemId} AND "familyGroupId" = ${context.familyId} LIMIT 1
  `;
  if (!item) throw new Error("Elemento non trovato.");
  if (item.status !== "pending_review") throw new Error("Questo elemento è già stato gestito.");

  if (decision === "reject") {
    await db`
      UPDATE "InboxItem" SET "status" = 'rejected', "resolvedAt" = NOW()
      WHERE "id" = ${inboxItemId} AND "familyGroupId" = ${context.familyId}
    `;
    await writeAudit({ familyGroupId: context.familyId, actorUserId: context.userId, action: "inbox.reject", entityType: "InboxItem", entityId: inboxItemId });
    revalidatePath("/inbox");
    return { created: 0 };
  }

  const proposed = item.proposed as { items?: ResolvedItem[] } | null;
  const items = proposed?.items ?? [];
  let created = 0;

  for (const entry of items) {
    if (entry.kind === "event" && entry.startIso && entry.endIso) {
      const start = new Date(entry.startIso);
      const end = new Date(entry.endIso);
      if (end <= start) continue;
      await db`
        INSERT INTO "Event" (
          "id", "familyGroupId", "title", "description", "location", "startTime", "endTime", "category", "status",
          "assignedUserId", "preparationMinutes", "travelMinutes", "requiresBooking", "visibility", "createdById", "updatedAt"
        )
        VALUES (gen_random_uuid()::text, ${context.familyId}, ${entry.title}, ${entry.notes ?? null}, ${entry.location ?? null},
          ${start}, ${end}, ${entry.category as Category}, ${entry.assigneeId ? "CONFIRMED" : "UNASSIGNED"}, ${entry.assigneeId},
          ${entry.preparation_minutes ?? 0}, ${entry.travel_minutes ?? 0}, ${entry.requires_booking}, 'household', ${context.userId}, NOW())
      `;
    } else {
      const dueAt = entry.startIso ? new Date(entry.startIso) : null;
      await db`
        INSERT INTO "Task" (
          "id", "familyGroupId", "title", "description", "status", "assignedToId", "dueDate", "dueAt",
          "activityStatus", "category", "estimatedMinutes", "preparationMinutes", "travelMinutes", "visibility", "createdById", "updatedAt"
        )
        VALUES (gen_random_uuid()::text, ${context.familyId}, ${entry.title}, ${entry.notes ?? null}, ${TaskStatus.PENDING},
          ${entry.assigneeId}, ${dueAt ?? new Date()}, ${dueAt}, ${entry.assigneeId ? ActivityStatus.ASSIGNED : ActivityStatus.UNASSIGNED},
          ${entry.category}, ${entry.estimated_minutes ?? 30}, ${entry.preparation_minutes ?? 0}, ${entry.travel_minutes ?? 0},
          'household', ${context.userId}, NOW())
    `;
    }
    created += 1;
  }

  await db`
    UPDATE "InboxItem" SET "status" = 'accepted', "resolvedAt" = NOW()
    WHERE "id" = ${inboxItemId} AND "familyGroupId" = ${context.familyId}
  `;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "inbox.accept",
    entityType: "InboxItem",
    entityId: inboxItemId,
    afterValue: { created },
  });
  revalidatePath("/inbox");
  revalidatePath("/careboard");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  return { created };
}

export type SummaryResult =
  | { ok: true; headline: string; highlights: string[]; imbalances: string[]; invisibleWork: string[]; suggestions: string[]; confidence: number; redactions: number }
  | { ok: false; error: string };

// Il riepilogo settimanale è narrativo e non giudicante: nessuna classifica, nessun punteggio morale.
export async function generateWeekSummary(): Promise<SummaryResult> {
  const context = await getFamilyContext();
  if (!isAiConfigured()) {
    return { ok: false, error: "Il Care Orchestrator non è configurato: manca la chiave OpenRouter sul server." };
  }
  const period = weekRange(new Date());
  const { report, members } = await loadWorkload(context.familyId, period);
  const aiContext = await buildContext(context);
  try {
    const { summary, redactions } = await summariseWeek(buildWeeklySummaryInput(report, members, period), aiContext);
    await writeAudit({ familyGroupId: context.familyId, actorUserId: context.userId, action: "summary.generate", entityType: "WeeklySummary" });
    return {
      ok: true,
      headline: summary.headline,
      highlights: summary.highlights,
      imbalances: summary.imbalances,
      invisibleWork: summary.invisible_work,
      suggestions: summary.suggestions,
      confidence: summary.confidence,
      redactions,
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { ok: false, error: error.message };
    throw error;
  }
}
