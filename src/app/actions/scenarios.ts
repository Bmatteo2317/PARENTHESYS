"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/family";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { loadScenarioVariants, weekRange } from "@/lib/insights";

const scenarioSchema = z.object({
  name: z.string().trim().min(2).max(120),
  question: z.string().trim().max(300).optional(),
});

// Salvare uno scenario congela le varianti calcolate: nessun "vincitore", solo alternative da confrontare.
export async function saveScenario(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = scenarioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Dai un nome allo scenario che vuoi salvare.");

  const variants = await loadScenarioVariants(context.familyId, weekRange(new Date()));
  const [scenario] = await db`
    INSERT INTO "Scenario" ("id", "familyGroupId", "name", "question", "createdById")
    VALUES (gen_random_uuid()::text, ${context.familyId}, ${parsed.data.name}, ${parsed.data.question ?? null}, ${context.userId})
    RETURNING "id"
  `;

  for (const variant of variants) {
    await db`
      INSERT INTO "ScenarioVariant" ("id", "scenarioId", "label", "kind", "mutations", "metrics", "summary")
      VALUES (gen_random_uuid()::text, ${scenario.id}, ${variant.label}, ${variant.kind},
        ${JSON.stringify(variant.mutations)}::jsonb, ${JSON.stringify(variant.metrics)}::jsonb, ${variant.summary})
    `;
  }

  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "scenario.create",
    entityType: "Scenario",
    entityId: scenario.id as string,
    afterValue: { name: parsed.data.name, variants: variants.length },
  });

  revalidatePath("/scenarios");
  return { id: scenario.id as string };
}

export async function deleteScenario(formData: FormData) {
  const context = await requirePermission("task.assign");
  const parsed = z.string().min(1).safeParse(formData.get("scenarioId"));
  if (!parsed.success) throw new Error("Scenario non valido.");
  await db`DELETE FROM "Scenario" WHERE "id" = ${parsed.data} AND "familyGroupId" = ${context.familyId}`;
  await writeAudit({
    familyGroupId: context.familyId,
    actorUserId: context.userId,
    action: "scenario.delete",
    entityType: "Scenario",
    entityId: parsed.data,
  });
  revalidatePath("/scenarios");
}
