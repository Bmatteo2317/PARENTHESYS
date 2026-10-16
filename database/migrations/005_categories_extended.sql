-- 005: categorie estese. Il blueprint distingue cura, commissioni, documenti e comunità
-- anche negli eventi, non solo nelle attività.

ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'CARE';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'ERRANDS';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'COMMUNITY';

-- La rotazione registra l'ultima persona coinvolta, così il turno successivo non ricade sempre sulla stessa.
ALTER TABLE "Rotation" ADD COLUMN IF NOT EXISTS "lastRotatedAt" TIMESTAMP(3);
