import { TaskStatus } from "@/lib/domain";
import { AppPage } from "@/components/app-page";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";
import { TaskBoard } from "@/components/task-board";
import { SupportRequestsBoard } from "@/components/support-requests-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const context = await getFamilyContext();
  const [tasks, members, supportRequests] = await Promise.all([
    db`
      SELECT t."id", t."title", t."description", t."status", t."dueDate", t."points", t."assignedToId",
        jsonb_build_object('id', u."id", 'name', u."name", 'avatarColor', u."avatarColor") AS "assignedTo"
      FROM "Task" t JOIN "User" u ON u."id" = t."assignedToId"
      WHERE t."familyGroupId" = ${context.familyId}
        AND (${context.membership.permission !== "MEMBER"} OR t."assignedToId" = ${context.userId})
      ORDER BY t."status" ASC, t."dueDate" ASC
    `,
    db`
      SELECT u."id", u."name" FROM "FamilyMember" fm
      JOIN "User" u ON u."id" = fm."userId"
      WHERE fm."familyGroupId" = ${context.familyId} ORDER BY fm."joinedAt" ASC
    `,
    db`
      SELECT request."id", request."title", request."description", request."neededBy", request."status",
        request."createdById", creator."name" AS "createdByName",
        request."claimedById", claimant."name" AS "claimedByName"
      FROM "SupportRequest" request
      JOIN "User" creator ON creator."id" = request."createdById"
      LEFT JOIN "User" claimant ON claimant."id" = request."claimedById"
      WHERE request."familyGroupId" = ${context.familyId} AND request."status" IN ('OPEN', 'CLAIMED')
      ORDER BY CASE WHEN request."status" = 'OPEN' THEN 0 ELSE 1 END, request."neededBy" ASC
    `,
  ]);
  const pending = tasks.filter((task) => task.status !== TaskStatus.COMPLETED).length;

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading"><div><h1>Piccole cose, fatte insieme.</h1><p>Attività condivise, responsabilità chiare e piccoli traguardi da festeggiare.</p></div><span className="role-pill">{pending} {pending === 1 ? "attività aperta" : "attività aperte"}</span></div>
        <TaskBoard
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            dueDate: new Date(task.dueDate).toISOString(),
            points: task.points,
            assignedToId: task.assignedToId,
            assignedTo: task.assignedTo,
          }))}
          people={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
          canManage={context.isAdmin || context.membership.permission === "HELPER"}
        />
        <SupportRequestsBoard requests={supportRequests.map((request) => ({
          id: request.id,
          title: request.title,
          description: request.description,
          neededBy: String(request.neededBy).slice(0, 10),
          status: request.status,
          createdById: request.createdById,
          createdByName: request.createdByName,
          claimedById: request.claimedById,
          claimedByName: request.claimedByName,
        }))} currentUserId={context.userId} />
      </div>
    </AppPage>
  );
}
