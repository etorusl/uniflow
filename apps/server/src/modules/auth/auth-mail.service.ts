import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';
import { MailService } from '../../infrastructure/mail.service.js';
import { hashToken } from './tokens.js';

export interface AuthEmailJob {
  userId: string;
  purpose: 'RESET_PASSWORD';
}
@Injectable()
export class AuthMailService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}
  async send(job: AuthEmailJob) {
    const user = await this.db.user.findUnique({ where: { id: job.userId } });
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 1800_000);
    await this.db.$transaction(async (tx) => {
      await tx.actionToken.updateMany({
        where: { userId: user.id, purpose: job.purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.actionToken.create({
        data: { userId: user.id, purpose: job.purpose, tokenHash: hashToken(token), expiresAt },
      });
    });
    const url = new URL('/reset-password', this.env.WEB_ORIGIN);
    url.searchParams.set('token', token);
    await this.mail.transport.sendMail({
      from: this.env.SMTP_FROM,
      to: user.email,
      subject: 'Восстановление доступа к UniFlow',
      text: `Чтобы задать новый пароль, перейдите по ссылке:\n\n${url.toString()}\n\nСсылка действует 30 минут.\nЕсли вы не отправляли запрос, проигнорируйте письмо.`,
    });
  }
}
