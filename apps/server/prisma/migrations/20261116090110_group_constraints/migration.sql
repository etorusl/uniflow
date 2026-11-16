-- The owner is recorded once and must belong to the group when the transaction commits.
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_owner_member_fkey"
    FOREIGN KEY ("id", "ownerId") REFERENCES "group_members"("groupId", "userId")
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "group_members" ADD CONSTRAINT "group_members_blocked_has_left"
    CHECK ("blockedAt" IS NULL OR "leftAt" IS NOT NULL);

ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_use_bounds"
    CHECK ("maxUses" BETWEEN 1 AND 250 AND "uses" BETWEEN 0 AND "maxUses"),
    ADD CONSTRAINT "group_invitations_expiry_order" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_shared_completion_shape" CHECK (
    (("completedAt" IS NULL AND "deadlineAtCompletion" IS NULL AND "completedById" IS NULL)
    OR ("mode" = 'SHARED' AND "completedAt" IS NOT NULL AND "deadlineAtCompletion" IS NOT NULL))
    AND "deadlineRevision" > 0
);
