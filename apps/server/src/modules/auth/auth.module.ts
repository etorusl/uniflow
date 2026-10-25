import { Module } from '@nestjs/common';
import { AuthController, UsersController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { SessionGuard } from './session.guard.js';
import { RateLimitService } from './rate-limit.service.js';

@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthService, AuthMailService, SessionGuard, RateLimitService],
  exports: [AuthService, AuthMailService, SessionGuard],
})
export class AuthModule {}
