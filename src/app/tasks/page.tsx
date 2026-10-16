import { TaskStatus } from "@prisma/client";
import { AppPage } from "@/components/app-page";
import { getFamilyContext } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import { TaskBoard } from "@/components/task-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const context = await getFamilyContext();
  const [tasks, members] = await Promise.all([
    prisma.task.findMany({
      where: { familyGroupId: context.familyId, ...(context.membership.permission === "MEMBER" ? { assignedToId: context.userId } : {}) },
      include: { assignedTo: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.familyMember.findMany({
      where: { familyGroupId: context.familyId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
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
            dueDate: task.dueDate.toISOString(),
            points: task.points,
            assignedToId: task.assignedToId,
            assignedTo: task.assignedTo,
          }))}
          people={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
          canManage={context.isAdmin || context.membership.permission === "HELPER"}
        />
      </div>
    </AppPage>
  );
}
