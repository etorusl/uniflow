-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'DELETING');

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "groupId" UUID,
    "personalTaskId" UUID,
    "groupTaskId" UUID,
    "materialId" UUID,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materials_groupId_deletedAt_createdAt_id_idx" ON "materials"("groupId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_objectKey_key" ON "attachments"("objectKey");

-- CreateIndex
CREATE INDEX "attachments_personalTaskId_status_idx" ON "attachments"("personalTaskId", "status");

-- CreateIndex
CREATE INDEX "attachments_groupTaskId_status_idx" ON "attachments"("groupTaskId", "status");

-- CreateIndex
CREATE INDEX "attachments_materialId_status_idx" ON "attachments"("materialId", "status");

-- CreateIndex
CREATE INDEX "attachments_uploaderId_status_idx" ON "attachments"("uploaderId", "status");

-- CreateIndex
CREATE INDEX "attachments_groupId_status_idx" ON "attachments"("groupId", "status");

-- CreateIndex
CREATE INDEX "attachments_status_expiresAt_idx" ON "attachments"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_personalTaskId_fkey" FOREIGN KEY ("personalTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_groupTaskId_fkey" FOREIGN KEY ("groupTaskId") REFERENCES "group_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A file belongs to at most one publication. Zero links permits safe GC after parent deletion.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_single_parent" CHECK (num_nonnulls("personalTaskId", "groupTaskId", "materialId") <= 1);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_byte_size" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760);
