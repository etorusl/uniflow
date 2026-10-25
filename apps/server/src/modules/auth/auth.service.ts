import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromPrisma } from 'pg-boss/dist/adapters/prisma.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { JobsService, AUTH_EMAIL_QUEUE } from '../../infrastructure/jobs.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { LoginDto, RegisterDto, UserDto, ProfileDto } from './auth.dto.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import { hashToken, SESSION_DAYS } from './tokens.js';

export const userSelection = {
  id: true,
  email: true,
  displayName: true,
  timeZone: true,
  createdAt: true,
} as const;
export function presentUser(user: {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
  createdAt: Date;
}): UserDto {
  return { id: user.id, email: user.email, displayName: user.displayName, timeZone: user.timeZone };
}
export function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    throw new BadRequestException('Укажите существующий часовой пояс IANA.');
  }
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  async register(input: RegisterDto) {
    assertTimeZone(input.timeZone);
    const passwordHash = await hashPassword(input.password);
    try {
      await this.db.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          timeZone: input.timeZone,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'Этот email уже используется. Войдите или восстановите пароль.',
        );
      throw error;
    }
  }
  async login(input: LoginDto) {
    const found = await this.db.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, found?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!found || !valid) throw new UnauthorizedException('Неверный email или пароль.');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    const user = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${found.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: found.id } });
      if (current.passwordHash !== found.passwordHash)
        throw new UnauthorizedException('Неверный email или пароль.');
      await tx.session.create({
        data: { userId: found.id, tokenHash: hashToken(token), expiresAt },
      });
      return presentUser(current);
    });
    return { token, user, expiresAt };
  }
  async requestEmail(email: string, purpose: 'RESET_PASSWORD') {
    await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (user)
        await this.jobs.boss.send(
          AUTH_EMAIL_QUEUE,
          { userId: user.id, purpose },
          { db: fromPrisma(tx), retryLimit: 5, retryDelay: 5, retryBackoff: true },
        );
    });
  }
  async consumeToken(token: string, purpose: 'RESET_PASSWORD', password: string) {
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      const entry = await tx.actionToken.findUnique({ where: { tokenHash: hashToken(token) } });
      const now = new Date();
      if (!entry || entry.purpose !== purpose || entry.usedAt || entry.expiresAt <= now)
        throw new BadRequestException(
          'Ссылка недействительна или срок её действия истёк. Запросите новую.',
        );
      const consumed = await tx.actionToken.updateMany({
        where: { id: entry.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Эта ссылка уже использована.');
      await tx.user.update({ where: { id: entry.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: entry.userId } });
      await tx.actionToken.updateMany({
        where: { userId: entry.userId, purpose, usedAt: null },
        data: { usedAt: now },
      });
    });
  }
  async updateProfile(userId: string, input: ProfileDto) {
    assertTimeZone(input.timeZone);
    return presentUser(
      await this.db.user.update({
        where: { id: userId },
        data: { displayName: input.displayName.trim(), timeZone: input.timeZone },
        select: userSelection,
      }),
    );
  }
}
