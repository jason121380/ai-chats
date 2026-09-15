-- A discussion can be run as a collaboration or as a debate.
--
-- COLLABORATIVE is the default, and existing rows take it: the prompts that
-- produced them pushed participants to disagree, but that is the behaviour
-- being corrected, not a property worth preserving as DEBATE.
--
-- Rollback:
--   ALTER TABLE "CouncilRun" DROP COLUMN "discussionStyle";
--   DROP TYPE "DiscussionStyle";

CREATE TYPE "DiscussionStyle" AS ENUM ('COLLABORATIVE', 'DEBATE');

ALTER TABLE "CouncilRun"
  ADD COLUMN "discussionStyle" "DiscussionStyle" NOT NULL DEFAULT 'COLLABORATIVE';
