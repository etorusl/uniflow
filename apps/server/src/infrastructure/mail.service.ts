import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ENVIRONMENT, type Environment } from './environment.js';

@Injectable()
export class MailService implements OnModuleDestroy {
  readonly transport: nodemailer.Transporter;
  constructor(@Inject(ENVIRONMENT) readonly env: Environment) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });
  }
  async check() {
    await this.transport.verify();
  }
  onModuleDestroy() {
    this.transport.close();
  }
}
