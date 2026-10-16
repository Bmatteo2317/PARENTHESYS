import { neon } from "@neondatabase/serverless";
import { hash } from "bcryptjs";

// Popola un nucleo demo coerente con il blueprint: persone, profili assistiti,
// eventi, attività con carico multi-dimensionale e check-in volontari.
// Lo script è idempotente: gli id sono fissi e le righe già presenti non vengono duplicate.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Configura DATABASE_URL prima di caricare i dati demo.");
}

const sql = neon(connectionString);
const PASSWORD = process.env.SEED_PASSWORD ?? "parenthesys-demo";
const FAMILY_ID = "seed-family-bernardi";
const CREATED_BY = "seed-user-lucia";

const users = [
  {
    id: "seed-user-lucia",
    name: "Lucia Bernardi",
    displayName: "Lucia",
    email: "lucia@demo.parenthesys.app",
    avatarColor: "#7c5cff",
    roleName: "Referente del nucleo",
    roleKey: "owner",
    permission: "ADMIN",
  },
  {
    id: "seed-user-marco",
    name: "Marco Bernardi",
    displayName: "Marco",
    email: "marco@demo.parenthesys.app",
    avatarColor: "#2bb3a3",
    roleName: "Amministrazione",
    roleKey: "administrator",
    permission: "ADMIN",
  },
  {
    id: "seed-user-elena",
    name: "Elena Rossi",
    displayName: "Nonna Elena",
    email: "elena@demo.parenthesys.app",
    avatarColor: "#e08a3c",
    roleName: "Nonna",
    roleKey: "caregiver",
    permission: "HELPER",
  },
  {
    id: "seed-user-davide",
    name: "Davide Colombo",
    displayName: "Davide",
    email: "davide@demo.parenthesys.app",
    avatarColor: "#4c8bf5",
    roleName: "Zio di supporto",
    roleKey: "member",
    permission: "HELPER",
  },
];

const kids = [
  { id: "seed-kid-sofia", name: "Sofia", birthDate: "2017-04-12", avatarColor: "#cf7d9c" },
  { id: "seed-kid-leo", name: "Leo", birthDate: "2020-09-03", avatarColor: "#5cc8b0" },
];

// Lunedi della settimana corrente, così i dati demo restano sempre "attuali".
function monday(reference = new Date()) {
  const start = new Date(reference);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function at(weekStart, dayOffset, hour, minute = 0) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const weekStart = monday();

const events = [
  { id: "seed-event-1", title: "Ingresso a scuola", day: 0, start: [8, 15], end: [8, 45], category: "SCHOOL", assigned: "seed-user-lucia", kid: "seed-kid-sofia", travel: 20 },
  { id: "seed-event-2", title: "Allenamento di calcio", day: 1, start: [17, 30], end: [19, 0], category: "SPORT", assigned: "seed-user-marco", kid: "seed-kid-leo", travel: 30, chaperone: "seed-user-elena" },
  { id: "seed-event-3", title: "Visita dentistica", day: 2, start: [15, 0], end: [16, 0], category: "HEALTH", assigned: "seed-user-lucia", kid: "seed-kid-leo", prep: 15, travel: 40, booking: true },
  { id: "seed-event-4", title: "Lezione di pianoforte", day: 3, start: [18, 0], end: [18, 45], category: "LEISURE", assigned: "seed-user-davide", kid: "seed-kid-sofia", travel: 25 },
  { id: "seed-event-5", title: "Riunione dei genitori", day: 4, start: [20, 30], end: [21, 30], category: "SCHOOL", assigned: "seed-user-marco", kid: "seed-kid-sofia", booking: true },
  { id: "seed-event-6", title: "Cena a casa dei nonni", day: 5, start: [19, 30], end: [21, 30], category: "HOUSEHOLD", assigned: "seed-user-elena", kid: null, travel: 15 },
];

const tasks = [
  { id: "seed-task-1", title: "Comprare il latte e la frutta", category: "ERRANDS", estimated: 40, assigned: "seed-user-marco", status: "assigned", flexibility: "flexible", day: 1, mental: 1 },
  { id: "seed-task-2", title: "Prenotare la visita di controllo", category: "ADMIN", estimated: 20, coordination: 15, assigned: "seed-user-lucia", status: "accepted", flexibility: "semi_flexible", day: 0, mental: 3, urgency: 3 },
  { id: "seed-task-3", title: "Preparare le cartelle per la scuola", category: "CARE", estimated: 30, assigned: "seed-user-lucia", status: "in_progress", flexibility: "fixed", day: 0, mental: 2, emotional: 2 },
  { id: "seed-task-4", title: "Portare fuori la differenziata", category: "HOUSEHOLD", estimated: 15, assigned: "seed-user-davide", status: "unassigned", flexibility: "fixed", day: 2, mental: 1 },
  { id: "seed-task-5", title: "Riordinare la cameretta con i bambini", category: "HOUSEHOLD", estimated: 45, assigned: "seed-user-elena", status: "assigned", flexibility: "flexible", day: 4, mental: 2, rotates: true },
  { id: "seed-task-6", title: "Chiamare il pediatra per Leo", category: "HEALTH", estimated: 25, coordination: 10, assigned: null, status: "unassigned", flexibility: "semi_flexible", day: 1, mental: 3, emotional: 3, urgency: 4 },
];

const checkIns = [
  { id: "seed-checkin-1", userId: "seed-user-lucia", capacity: "reduced", stress: 3, energy: 2, sleep: 2, needPause: true, note: "Settimana con una scadenza al lavoro.", shareLevel: "band" },
  { id: "seed-checkin-2", userId: "seed-user-marco", capacity: "normal", stress: 2, energy: 3, sleep: 4, needPause: false, note: null, shareLevel: "band" },
  { id: "seed-checkin-3", userId: "seed-user-elena", capacity: "high", stress: 1, energy: 4, sleep: 4, needPause: false, note: null, shareLevel: "band" },
];

async function main() {
  const passwordHash = await hash(PASSWORD, 12);

  for (const user of users) {
    await sql`
      INSERT INTO "User" ("id", "name", "displayName", "email", "passwordHash", "avatarColor", "locale", "timeZone", "updatedAt")
      VALUES (${user.id}, ${user.name}, ${user.displayName}, ${user.email}, ${passwordHash}, ${user.avatarColor}, 'it-IT', 'Europe/Rome', NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name", "displayName" = EXCLUDED."displayName",
        "passwordHash" = EXCLUDED."passwordHash", "avatarColor" = EXCLUDED."avatarColor", "updatedAt" = NOW()
    `;
  }

  await sql`
    INSERT INTO "FamilyGroup" ("id", "name", "inviteCode", "type", "locale", "timezone", "description", "updatedAt")
    VALUES (${FAMILY_ID}, 'Casa Bernardi', 'DEMO2026', 'co_parenting', 'it-IT', 'Europe/Rome',
      'Nucleo demo: due genitori, una nonna di supporto e due bambini.', NOW())
    ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "updatedAt" = NOW()
  `;

  for (const user of users) {
    await sql`
      INSERT INTO "FamilyMember" ("id", "userId", "familyGroupId", "roleName", "roleKey", "permission", "color")
      VALUES (${`seed-member-${user.id}`}, ${user.id}, ${FAMILY_ID}, ${user.roleName}, ${user.roleKey}, ${user.permission}, ${user.avatarColor})
      ON CONFLICT ("userId", "familyGroupId") DO UPDATE SET
        "roleName" = EXCLUDED."roleName", "roleKey" = EXCLUDED."roleKey", "permission" = EXCLUDED."permission", "color" = EXCLUDED."color"
    `;
  }

  for (const kid of kids) {
    await sql`
      INSERT INTO "KidProfile" ("id", "familyGroupId", "name", "birthDate", "avatarColor", "kind", "isAccountHolder")
      VALUES (${kid.id}, ${FAMILY_ID}, ${kid.name}, ${kid.birthDate}, ${kid.avatarColor}, 'minor', false)
      ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "birthDate" = EXCLUDED."birthDate", "avatarColor" = EXCLUDED."avatarColor"
    `;
  }

  await sql`DELETE FROM "Event" WHERE "id" LIKE 'seed-event-%' AND "familyGroupId" = ${FAMILY_ID}`;
  for (const event of events) {
    const start = at(weekStart, event.day, event.start[0], event.start[1]);
    const end = at(weekStart, event.day, event.end[0], event.end[1]);
    await sql`
      INSERT INTO "Event" (
        "id", "familyGroupId", "title", "startTime", "endTime", "category", "status", "assignedUserId",
        "chaperoneUserId", "kidProfileId", "preparationMinutes", "travelMinutes", "requiresBooking", "visibility", "createdById", "updatedAt"
      )
      VALUES (
        ${event.id}, ${FAMILY_ID}, ${event.title}, ${start}, ${end}, ${event.category},
        ${event.assigned ? "CONFIRMED" : "UNASSIGNED"}, ${event.assigned ?? null}, ${event.chaperone ?? null}, ${event.kid ?? null},
        ${event.prep ?? 0}, ${event.travel ?? 0}, ${event.booking ?? false}, 'household', ${CREATED_BY}, NOW()
      )
      ON CONFLICT ("id") DO NOTHING
    `;
  }

  await sql`DELETE FROM "Task" WHERE "id" LIKE 'seed-task-%' AND "familyGroupId" = ${FAMILY_ID}`;
  for (const task of tasks) {
    const due = at(weekStart, task.day, 18, 0);
    await sql`
      INSERT INTO "Task" (
        "id", "familyGroupId", "title", "status", "assignedToId", "dueDate", "dueAt", "points", "activityStatus",
        "category", "estimatedMinutes", "coordinationMinutes", "mentalLoad", "emotionalLoad", "urgency",
        "flexibility", "rotates", "visibility", "createdById", "updatedAt"
      )
      VALUES (
        ${task.id}, ${FAMILY_ID}, ${task.title}, 'PENDING', ${task.assigned ?? null}, ${due}, ${due}, 0, ${task.status},
        ${task.category}, ${task.estimated}, ${task.coordination ?? 0}, ${task.mental ?? 1}, ${task.emotional ?? 1}, ${task.urgency ?? 1},
        ${task.flexibility}, ${task.rotates ?? false}, 'household', ${CREATED_BY}, NOW()
      )
      ON CONFLICT ("id") DO NOTHING
    `;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const checkIn of checkIns) {
    await sql`
      INSERT INTO "CheckIn" (
        "id", "familyGroupId", "userId", "kind", "capacity", "stress", "energy", "sleep", "needPause", "note", "shareLevel", "recordedFor"
      )
      VALUES (
        ${checkIn.id}, ${FAMILY_ID}, ${checkIn.userId}, 'daily', ${checkIn.capacity}, ${checkIn.stress}, ${checkIn.energy},
        ${checkIn.sleep}, ${checkIn.needPause}, ${checkIn.note}, ${checkIn.shareLevel}, ${today}
      )
      ON CONFLICT ("id") DO UPDATE SET
        "capacity" = EXCLUDED."capacity", "stress" = EXCLUDED."stress", "energy" = EXCLUDED."energy",
        "sleep" = EXCLUDED."sleep", "needPause" = EXCLUDED."needPause", "note" = EXCLUDED."note", "recordedFor" = EXCLUDED."recordedFor"
    `;
  }

  await sql`
    INSERT INTO "Invitation" ("id", "familyGroupId", "token", "shortCode", "roleKey", "permission", "createdById", "label", "maxUses", "expiresAt")
    VALUES ('seed-invitation-1', ${FAMILY_ID}, 'demo-invite-token', 'DEMO26', 'member', 'HELPER', ${CREATED_BY},
      'Invito demo per una persona di supporto', 5, NOW() + INTERVAL '30 days')
    ON CONFLICT ("id") DO NOTHING
  `;

  const [{ count }] = await sql`SELECT COUNT(*)::int AS "count" FROM "FamilyMember" WHERE "familyGroupId" = ${FAMILY_ID}`;
  console.log(`Dati demo pronti per "Casa Bernardi" (${count} persone).`);
  console.log(`Accesso: ${users[0].email} / ${PASSWORD}`);
  console.log("Codice invito demo: DEMO2026");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Caricamento dei dati demo non riuscito.", error);
    process.exit(1);
  });
