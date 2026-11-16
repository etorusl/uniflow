-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('MEMBER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "GroupTaskMode" AS ENUM ('INDIVIDUAL', 'SHARED');

-- CreateTable
CREATE TABLE "study_groups" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "subjectId" UUID,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),
    "blockedAt" TIMESTAMPTZ(3),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "group_invitations" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "creatorId" UUID,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_audit_events" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "actorId" UUID,
    "targetUserId" UUID,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_tasks" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorId" UUID,
    "mode" "GroupTaskMode" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "deadlineRevision" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "deadlineAtCompletion" TIMESTAMPTZ(3),
    "completedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "group_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_task_completions" (
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "deadlineAtCompletion" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_task_completions_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "group_task_events" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID,
    "kind" "TaskEventKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineSnapshot" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_groups_ownerId_idx" ON "study_groups"("ownerId");

-- CreateIndex
CREATE INDEX "group_members_userId_leftAt_idx" ON "group_members"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "group_members_groupId_leftAt_joinedAt_idx" ON "group_members"("groupId", "leftAt", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_invitations_tokenHash_key" ON "group_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "group_invitations_groupId_expiresAt_idx" ON "group_invitations"("groupId", "expiresAt");

-- CreateIndex
CREATE INDEX "group_audit_events_groupId_createdAt_idx" ON "group_audit_events"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "group_tasks_groupId_deletedAt_dueAt_id_idx" ON "group_tasks"("groupId", "deletedAt", "dueAt", "id");

-- CreateIndex
CREATE INDEX "group_task_completions_userId_taskId_idx" ON "group_task_completions"("userId", "taskId");

-- CreateIndex
CREATE INDEX "group_task_events_taskId_createdAt_id_idx" ON "group_task_events"("taskId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "group_task_events_taskId_actorId_createdAt_id_idx" ON "group_task_events"("taskId", "actorId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_audit_events" ADD CONSTRAINT "group_audit_events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_audit_events" ADD CONSTRAINT "group_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_task_completions" ADD CONSTRAINT "group_task_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "group_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_task_completions" ADD CONSTRAINT "group_task_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_task_events" ADD CONSTRAINT "group_task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "group_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_task_events" ADD CONSTRAINT "group_task_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

