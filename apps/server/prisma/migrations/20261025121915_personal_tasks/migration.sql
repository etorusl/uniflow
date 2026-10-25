-- CreateEnum
CREATE TYPE "TaskEventKind" AS ENUM ('COMPLETED', 'REOPENED');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subjectId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "deadlineRevision" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "deadlineAtCompletion" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" "TaskEventKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineSnapshot" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_userId_dueAt_id_idx" ON "tasks"("userId", "dueAt", "id");

-- CreateIndex
CREATE INDEX "tasks_userId_completedAt_idx" ON "tasks"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "task_events_taskId_createdAt_idx" ON "task_events"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
