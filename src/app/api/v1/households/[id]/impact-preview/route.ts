import { NextRequest } from "next/server";
import { assertCapability, guard, json, parseDateParam, requireUser, resolveHousehold } from "@/lib/api";
import { Category, Flexibility } from "@/lib/domain";
import { analyseForAssignment, buildCandidates, buildEquityRequest, weekRange } from "@/lib/insights";
import { buildAlternatives, simulateImpact } from "@/lib/equity";

export const dynamic = "force-dynamic";

const categories = ["WORK", "SCHOOL", "SPORT", "HEALTH", "HOUSEHOLD", "LEISURE", "CARE", "ERRANDS", "ADMIN", "COMMUNITY"];

// Simulazione spiegabile: mostra l'impatto di un'assegnazione prima che venga decisa.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);
    assertCapability(membership, "task.assign");

    const params = request.nextUrl.searchParams;
    const title = params.get("title")?.trim() || "Nuova attività";
    const categoryParam = params.get("category");
    const category = (categoryParam && categories.includes(categoryParam) ? categoryParam : "HOUSEHOLD") as Category;
    const durationMinutes =
      Number(params.get("estimatedMinutes") ?? 30) +
      Number(params.get("preparationMinutes") ?? 0) +
      Number(params.get("travelMinutes") ?? 0) +
      Number(params.get("coordinationMinutes") ?? 0);
    const flexibility = (params.get("flexibility") ?? "flexible") as Flexibility;
    const rotates = params.get("rotates") === "true";
    const start = parseDateParam(params.get("start"), "start");

    const period = weekRange(start ?? new Date());
    const { candidates, report } = await buildCandidates(membership.familyGroupId, period, { start, durationMinutes, category });
    const equityRequest = buildEquityRequest(title, category, durationMinutes, flexibility, rotates, start, candidates);
    const analysis = analyseForAssignment(equityRequest);
    const alternatives = buildAlternatives(equityRequest, analysis);

    const loads = report.members.map((member) => ({ userId: member.userId, name: member.name, minutes: member.totalMinutes }));
    const impacts = candidates.map((candidate) => {
      const summary = simulateImpact(loads, candidate.userId, durationMinutes);
      return {
        userId: candidate.userId,
        name: candidate.name,
        narrative: summary.narrative,
        becomesLessBalanced: summary.becomesLessBalanced,
        deltaConcentration: summary.deltaConcentration,
      };
    });

    return json({
      request: { title, category, durationMinutes, flexibility, rotates, start: start ? start.toISOString() : null },
      options: analysis.options,
      recommendedUserId: analysis.recommended?.userId ?? null,
      unassigned: analysis.unassigned,
      alternatives,
      impacts,
    });
  });
}
