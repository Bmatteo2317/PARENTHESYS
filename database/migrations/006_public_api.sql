-- 006: API pubblica versionata — chiavi di idempotenza per le scritture ripetibili (reti instabili, dispositivi offline).

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "familyGroupId" TEXT REFERENCES "FamilyGroup"("id") ON DELETE CASCADE,
  "endpoint" TEXT NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 200,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "key")
);

CREATE INDEX IF NOT EXISTS "IdempotencyKey_userId_createdAt_idx" ON "IdempotencyKey"("userId", "createdAt");
