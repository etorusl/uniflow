CREATE TYPE "AttachmentState" AS ENUM ('PENDING', 'READY', 'DELETING');

CREATE TABLE "group_materials" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_materials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "group_materials_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "group_materials_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "uploaderId" UUID,
    "taskId" UUID,
    "groupTaskId" UUID,
    "materialId" UUID,
    "objectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "state" "AttachmentState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "attachments_groupTaskId_fkey" FOREIGN KEY ("groupTaskId") REFERENCES "group_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "attachments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "group_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "attachments_max_one_parent" CHECK (num_nonnulls("taskId", "groupTaskId", "materialId") <= 1),
    CONSTRAINT "attachments_valid_size" CHECK ("size" > 0 AND "size" <= 10485760)
);

CREATE INDEX "group_materials_groupId_createdAt_id_idx" ON "group_materials"("groupId", "createdAt", "id");
CREATE INDEX "group_materials_authorId_idx" ON "group_materials"("authorId");
CREATE UNIQUE INDEX "attachments_objectKey_key" ON "attachments"("objectKey");
CREATE INDEX "attachments_taskId_state_createdAt_idx" ON "attachments"("taskId", "state", "createdAt");
CREATE INDEX "attachments_groupTaskId_state_createdAt_idx" ON "attachments"("groupTaskId", "state", "createdAt");
CREATE INDEX "attachments_materialId_state_createdAt_idx" ON "attachments"("materialId", "state", "createdAt");
CREATE INDEX "attachments_uploaderId_state_idx" ON "attachments"("uploaderId", "state");
CREATE INDEX "attachments_state_createdAt_idx" ON "attachments"("state", "createdAt");
