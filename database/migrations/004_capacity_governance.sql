-- 004: capacity e benessere, notifiche, audit, scenari, care inbox, AI, export e cancellazione.

CREATE TABLE IF NOT EXISTS "CheckIn" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'daily',
  "capacity" TEXT NOT NULL DEFAULT 'normal',
  "stress" INTEGER,
  "energy" INTEGER,
  "sleep" INTEGER,
  "mood" INTEGER,
  "needPause" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "shareLevel" TEXT NOT NULL DEFAULT 'band',
  "recordedFor" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WorkloadRecord" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "operationalMinutes" INTEGER NOT NULL DEFAULT 0,
  "careMinutes" INTEGER NOT NULL DEFAULT 0,
  "householdMinutes" INTEGER NOT NULL DEFAULT 0,
  "coordinationMinutes" INTEGER NOT NULL DEFAULT 0,
  "onCallMinutes" INTEGER NOT NULL DEFAULT 0,
  "mentalLoadScore" INTEGER NOT NULL DEFAULT 0,
  "activityCount" INTEGER NOT NULL DEFAULT 0,
  "unassignedCount" INTEGER NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SupportProfile" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "relation" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'occasional',
  "paid" BOOLEAN NOT NULL DEFAULT false,
  "availability" TEXT,
  "linkUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "channels" JSONB NOT NULL DEFAULT '{"inApp":true,"email":false,"push":false}'::jsonb,
  "quietStart" TEXT,
  "quietEnd" TEXT,
  "digest" TEXT NOT NULL DEFAULT 'none',
  "onlyAssigned" BOOLEAN NOT NULL DEFAULT false,
  "onlyUrgent" BOOLEAN NOT NULL DEFAULT false,
  "grouped" BOOLEAN NOT NULL DEFAULT true,
  "pausedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "familyGroupId")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "actorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "beforeValue" JSONB,
  "afterValue" JSONB,
  "reason" TEXT,
  "sessionRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Scenario" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "question" TEXT,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ScenarioVariant" (
  "id" TEXT PRIMARY KEY,
  "scenarioId" TEXT NOT NULL REFERENCES "Scenario"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'rotate',
  "mutations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "InboxItem" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "source" TEXT NOT NULL DEFAULT 'text',
  "rawText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "proposed" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confidence" REAL,
  "explanation" TEXT,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "AiLog" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL DEFAULT true,
  "latencyMs" INTEGER,
  "promptChars" INTEGER,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ExportJob" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "requestedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "scope" TEXT NOT NULL DEFAULT 'me',
  "format" TEXT NOT NULL DEFAULT 'json',
  "status" TEXT NOT NULL DEFAULT 'ready',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "DeletionRequest" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "requestedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "subjectType" TEXT NOT NULL DEFAULT 'account',
  "subjectId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'personal',
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "AccessLog" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CheckIn_familyGroupId_userId_recordedFor_idx" ON "CheckIn"("familyGroupId", "userId", "recordedFor");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "AuditLog_familyGroupId_createdAt_idx" ON "AuditLog"("familyGroupId", "createdAt");
CREATE INDEX IF NOT EXISTS "Scenario_familyGroupId_idx" ON "Scenario"("familyGroupId");
CREATE INDEX IF NOT EXISTS "InboxItem_familyGroupId_status_idx" ON "InboxItem"("familyGroupId", "status");
CREATE INDEX IF NOT EXISTS "SupportProfile_familyGroupId_idx" ON "SupportProfile"("familyGroupId");
