DO $$ BEGIN CREATE TYPE "Permission" AS ENUM ('ADMIN', 'HELPER', 'MEMBER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Category" AS ENUM ('WORK', 'SCHOOL', 'SPORT', 'HEALTH', 'HOUSEHOLD', 'LEISURE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EventStatus" AS ENUM ('CONFIRMED', 'UNASSIGNED', 'CONFLICT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'CONFLICT_WARNING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "avatarUrl" TEXT,
  "avatarColor" TEXT NOT NULL DEFAULT '#3B82F6',
  "workSchedule" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OAuthAccount" (
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "FamilyGroup" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "inviteCode" TEXT NOT NULL UNIQUE,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "KidProfile" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "birthDate" TIMESTAMP(3),
  "notes" TEXT,
  "avatarColor" TEXT NOT NULL DEFAULT '#EC4899',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FamilyMember" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "roleName" TEXT NOT NULL,
  "permission" "Permission" NOT NULL DEFAULT 'ADMIN',
  "kidProfileId" TEXT UNIQUE REFERENCES "KidProfile"("id") ON DELETE SET NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "familyGroupId")
);

CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "category" "Category" NOT NULL DEFAULT 'SCHOOL',
  "status" "EventStatus" NOT NULL DEFAULT 'UNASSIGNED',
  "assignedUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "chaperoneUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "pickupUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "kidProfileId" TEXT REFERENCES "KidProfile"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endTime" > "startTime")
);

CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "assignedToId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kidProfileId" TEXT REFERENCES "KidProfile"("id") ON DELETE SET NULL,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "FamilyMember_familyGroupId_permission_idx" ON "FamilyMember"("familyGroupId", "permission");
CREATE INDEX IF NOT EXISTS "KidProfile_familyGroupId_idx" ON "KidProfile"("familyGroupId");
CREATE INDEX IF NOT EXISTS "Event_familyGroupId_startTime_idx" ON "Event"("familyGroupId", "startTime");
CREATE INDEX IF NOT EXISTS "Event_assignedUserId_startTime_endTime_idx" ON "Event"("assignedUserId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Event_kidProfileId_startTime_endTime_idx" ON "Event"("kidProfileId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Task_familyGroupId_dueDate_idx" ON "Task"("familyGroupId", "dueDate");
CREATE INDEX IF NOT EXISTS "Task_assignedToId_status_idx" ON "Task"("assignedToId", "status");
