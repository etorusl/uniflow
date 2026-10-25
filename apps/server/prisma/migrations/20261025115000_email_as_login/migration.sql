-- Email identifies an account; signing in does not require email verification.
ALTER TABLE "users" DROP COLUMN "emailVerifiedAt";

BEGIN;
CREATE TYPE "ActionPurpose_new" AS ENUM ('RESET_PASSWORD');
ALTER TABLE "action_tokens" ALTER COLUMN "purpose" TYPE "ActionPurpose_new" USING ("purpose"::text::"ActionPurpose_new");
ALTER TYPE "ActionPurpose" RENAME TO "ActionPurpose_old";
ALTER TYPE "ActionPurpose_new" RENAME TO "ActionPurpose";
DROP TYPE "ActionPurpose_old";
COMMIT;
