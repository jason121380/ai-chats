-- AlterEnum: SessionMode gains DISCUSSION
ALTER TYPE "SessionMode" ADD VALUE 'DISCUSSION';

-- AlterEnum: ModelRunStage gains DISCUSSION
ALTER TYPE "ModelRunStage" ADD VALUE 'DISCUSSION';

-- AlterEnum: CouncilRunStatus gains DISCUSSING
ALTER TYPE "CouncilRunStatus" ADD VALUE 'DISCUSSING';

-- CreateEnum
CREATE TYPE "CouncilRunKind" AS ENUM ('COUNCIL', 'DISCUSSION');

-- AlterTable: CouncilRun carries the run kind and discussion round tracking.
-- chairmanProvider / chairmanModel become nullable because a Discussion may
-- run without a closing summary.
ALTER TABLE "CouncilRun"
  ADD COLUMN "kind" "CouncilRunKind" NOT NULL DEFAULT 'COUNCIL',
  ADD COLUMN "totalRounds" INTEGER,
  ADD COLUMN "currentRound" INTEGER,
  ALTER COLUMN "chairmanProvider" DROP NOT NULL,
  ALTER COLUMN "chairmanModel" DROP NOT NULL;

-- AlterTable: ModelRun records discussion speaking order
ALTER TABLE "ModelRun"
  ADD COLUMN "roundNumber" INTEGER,
  ADD COLUMN "turnIndex" INTEGER;

-- CreateIndex
CREATE INDEX "CouncilRun_kind_idx" ON "CouncilRun"("kind");
