import { AppPage } from "@/components/app-page";
import { SupportBoard, type SupportItem } from "@/components/support-board";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const context = await getFamilyContext();
  const seeAll = context.membership.permission !== "MEMBER";
  const canRespond = context.capabilities.has("support.respond");

  const [requests, responses, tasks] = await Promise.all([
    db`
      SELECT r."id", r."message", r."reasonType", r."status", r."createdAt", r."createdById",
        u."name" AS "authorName", u."avatarColor" AS "authorColor", t."title" AS "taskTitle"
      FROM "SupportRequest" r
      JOIN "User" u ON u."id" = r."createdById"
      LEFT JOIN "Task" t ON t."id" = r."taskId"
      WHERE r."familyGroupId" = ${context.familyId} AND (${seeAll} OR r."createdById" = ${context.userId})
      ORDER BY r."createdAt" DESC LIMIT 50
    `,
    db`
      SELECT sr."id", sr."requestId", sr."response", sr."message", u."name" AS "responderName"
      FROM "SupportResponse" sr JOIN "User" u ON u."id" = sr."userId"
      WHERE sr."requestId" IN (SELECT "id" FROM "SupportRequest" WHERE "familyGroupId" = ${context.familyId})
      ORDER BY sr."createdAt" ASC
    `,
    db`
      SELECT "id", "title" FROM "Task"
      WHERE "familyGroupId" = ${context.familyId} AND "activityStatus" NOT IN ('completed', 'skipped', 'cancelled')
      ORDER BY "dueAt" ASC NULLS LAST LIMIT 30
    `,
  ]);

  const items: SupportItem[] = requests.map((request) => ({
    id: request.id as string,
    message: request.message as string,
    reasonType: request.reasonType as string,
    createdAtLabel: new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt as string)),
    authorName: request.authorName as string,
    authorColor: (request.authorColor as string) ?? "#7855dc",
    taskTitle: (request.taskTitle as string | null) ?? null,
    isMine: request.createdById === context.userId,
    status: request.status as string,
    responses: responses
      .filter((response) => response.requestId === request.id)
      .map((response) => ({
        id: response.id as string,
        response: response.response as string,
        message: (response.message as string | null) ?? null,
        responderName: response.responderName as string,
      })),
  }));

  const open = items.filter((item) => item.status === "open");
  const resolved = items.filter((item) => item.status !== "open");

  return (
    <AppPage>
      <div className="content-page">
        <div className="page-heading">
          <div>
            <h1>Richieste di aiuto.</h1>
            <p>Il modo più semplice per non far pesare a una sola persona ciò che riguarda tutti.</p>
          </div>
          <span className="role-pill">{open.length} in sospeso</span>
        </div>
        <SupportBoard
          openItems={open}
          resolvedItems={resolved}
          tasks={tasks.map((task) => ({ id: task.id as string, title: task.title as string }))}
          canRespond={canRespond}
        />
      </div>
    </AppPage>
  );
}
