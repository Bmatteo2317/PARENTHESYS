CREATE TABLE IF NOT EXISTS "SupportRequest" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "familyGroupId" TEXT NOT NULL REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "neededBy" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'CLAIMED', 'CANCELLED')),
  "claimedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SupportRequest_familyGroupId_status_neededBy_idx"
  ON "SupportRequest"("familyGroupId", "status", "neededBy");
