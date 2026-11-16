-- CreateEnum
CREATE TYPE "PushTransport" AS ENUM ('WEB', 'ANDROID');

-- CreateEnum
CREATE TYPE "ReminderTaskKind" AS ENUM ('PERSONAL', 'GROUP');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "reminder_preferences" (
    "userId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minutesBefore" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "reminder_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "transport" "PushTransport" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "p256dh" TEXT,
    "authSecret" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_revisions" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminder_revisions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ReminderTaskKind" NOT NULL,
    "taskId" UUID NOT NULL,
    "generation" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastResult" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_notices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ReminderTaskKind" NOT NULL,
    "taskId" UUID NOT NULL,
    "groupId" UUID,
    "generation" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "reminder_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_fingerprint_key" ON "push_subscriptions"("fingerprint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_revokedAt_idx" ON "push_subscriptions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "push_subscriptions_sessionId_transport_revokedAt_idx" ON "push_subscriptions"("sessionId", "transport", "revokedAt");

-- CreateIndex
CREATE INDEX "reminder_deliveries_status_updatedAt_idx" ON "reminder_deliveries"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_subscriptionId_kind_taskId_generation_key" ON "reminder_deliveries"("subscriptionId", "kind", "taskId", "generation");

-- CreateIndex
CREATE INDEX "reminder_notices_userId_createdAt_idx" ON "reminder_notices"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_notices_userId_kind_taskId_generation_key" ON "reminder_notices"("userId", "kind", "taskId", "generation");

-- AddForeignKey
ALTER TABLE "reminder_preferences" ADD CONSTRAINT "reminder_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_notices" ADD CONSTRAINT "reminder_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
