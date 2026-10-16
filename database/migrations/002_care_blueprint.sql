-- 002: blueprint di cura — persona, nucleo, relazione, inviti, disponibilità, vincoli, preferenze, consenso.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pronoun" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'it-IT';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'Europe/Rome';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'it-IT';
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "pronoun" TEXT;
ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "roleKey" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "FamilyMember" ADD COLUMN IF NOT EXISTS "color" TEXT;

ALTER TABLE "KidProfile" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'minor';
ALTER TABLE "KidProfile" ADD COLUMN IF NOT EXISTS "managedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "KidProfile" ADD COLUMN IF NOT EXISTS "access" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "KidProfile" ADD COLUMN IF NOT EXISTS "isAccountHolder" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "Invitation" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "shortCode" TEXT NOT NULL UNIQUE,
  "roleKey" TEXT NOT NULL DEFAULT 'member',
  "permission" "Permission" NOT NULL DEFAULT 'MEMBER',
  "careProfileId" TEXT REFERENCES "KidProfile"("id") ON DELETE SET NULL,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "label" TEXT,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AvailabilityRule" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'available',
  "weekday" INTEGER,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "startDate" DATE,
  "endDate" DATE,
  "note" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'household',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Constraint" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "careProfileId" TEXT REFERENCES "KidProfile"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "label" TEXT,
  "severity" INTEGER NOT NULL DEFAULT 1,
  "visibility" TEXT NOT NULL DEFAULT 'household',
  "activeFrom" DATE,
  "activeTo" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Preference" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'neutral',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Consent" (
  "id" TEXT PRIMARY KEY,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "subjectUserId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "careProfileId" TEXT REFERENCES "KidProfile"("id") ON DELETE CASCADE,
  "purpose" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'household',
  "grantedByUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "Invitation_familyGroupId_idx" ON "Invitation"("familyGroupId");
CREATE INDEX IF NOT EXISTS "AvailabilityRule_familyGroupId_userId_idx" ON "AvailabilityRule"("familyGroupId", "userId");
CREATE INDEX IF NOT EXISTS "Constraint_familyGroupId_userId_idx" ON "Constraint"("familyGroupId", "userId");
CREATE INDEX IF NOT EXISTS "Preference_familyGroupId_userId_idx" ON "Preference"("familyGroupId", "userId");
CREATE INDEX IF NOT EXISTS "Consent_familyGroupId_idx" ON "Consent"("familyGroupId");
