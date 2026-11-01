-- CreateEnum
CREATE TYPE "GroupTaskMode" AS ENUM ('INDIVIDUAL', 'SHARED');

-- CreateTable
CREATE TABLE "group_tasks" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "mode" "GroupTaskMode" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "deadlineRevision" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "deadlineAtCompletion" TIMESTAMPTZ(3),
    "completedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "group_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_completions" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "deadlineAtCompletion" TIMESTAMPTZ(3),

    CONSTRAINT "group_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_task_events" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "recipientId" UUID,
    "kind" "TaskEventKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineSnapshot" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_tasks_groupId_deletedAt_dueAt_id_idx" ON "group_tasks"("groupId", "deletedAt", "dueAt", "id");

-- CreateIndex
CREATE INDEX "group_completions_userId_completedAt_idx" ON "group_completions"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_completions_taskId_userId_key" ON "group_completions"("taskId", "userId");

-- CreateIndex
CREATE INDEX "group_task_events_taskId_recipientId_createdAt_id_idx" ON "group_task_events"("taskId", "recipientId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tasks" ADD CONSTRAINT "group_tasks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_completions" ADD CONSTRAINT "group_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "group_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_completions" ADD CONSTRAINT "group_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_task_events" ADD CONSTRAINT "group_task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "group_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
