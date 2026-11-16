import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushTransports } from './push-transports.js';
import { ReminderWorker } from './reminder-worker.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushTransports, ReminderWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
