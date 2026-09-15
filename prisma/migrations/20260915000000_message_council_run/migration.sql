-- A person can now speak inside a running discussion. Their message is a
-- Message row tied to the run it was said in.
--
-- Nullable and ON DELETE CASCADE: every existing message predates the feature
-- and keeps NULL, and an interjection has no meaning once its run is gone.
--
-- Rollback:
--   DROP INDEX "Message_councilRunId_createdAt_idx";
--   ALTER TABLE "Message" DROP CONSTRAINT "Message_councilRunId_fkey";
--   ALTER TABLE "Message" DROP COLUMN "councilRunId";

ALTER TABLE "Message" ADD COLUMN "councilRunId" UUID;

CREATE INDEX "Message_councilRunId_createdAt_idx"
  ON "Message"("councilRunId", "createdAt");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_councilRunId_fkey"
  FOREIGN KEY ("councilRunId") REFERENCES "CouncilRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
