import { NextRequest } from "next/server";
import { assertCapability, guard, json, parseDateParam, requireUser, resolveHousehold } from "@/lib/api";
import { loadWorkload, weekRange } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Il carico è multi-dimensionale: tempo operativo, cura, casa, coordinamento e reperibilità.
// Il dettaglio del carico altrui resta visibile solo a chi ha il permesso dedicato.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const userId = await requireUser();
    const { id } = await context.params;
    const membership = await resolveHousehold(userId, id);
    assertCapability(membership, "workload.read_aggregate");

    const reference = parseDateParam(request.nextUrl.searchParams.get("on"), "on") ?? new Date();
    const period = weekRange(reference);
    const { report } = await loadWorkload(membership.familyGroupId, period);
    const seeDetail = membership.capabilities.has("workload.read_detail");

    return json({
      period: { start: period.start.toISOString(), end: period.end.toISOString() },
      totals: {
        minutes: report.totalMinutes,
        concentration: Math.round(report.concentration * 100) / 100,
        coordinationMinutes: report.coordinationMinutes,
        onCallMinutes: report.onCallMinutes,
        unassignedCount: report.unassignedCount,
      },
      signals: report.signals,
      members: report.members.map((member) => ({
        userId: member.userId,
        capacity: member.capacity,
        totalMinutes: member.totalMinutes,
        share: member.share,
        activityCount: member.activityCount,
        openCount: member.openCount,
        mentalLoadScore: member.mentalLoadScore,
        // Il dettaglio per dimensione è aggregato: non rivela la natura privata dei singoli impegni.
        minutes: seeDetail || member.userId === userId ? member.minutes : undefined,
      })),
      detailVisible: seeDetail,
    });
  });
}
