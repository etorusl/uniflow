import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { ENVIRONMENT, parseEnvironment } from './environment.js';
import { JobsService } from './jobs.service.js';
import { MailService } from './mail.service.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    { provide: ENVIRONMENT, useFactory: () => parseEnvironment(process.env) },
    DatabaseService,
    JobsService,
    MailService,
    StorageService,
  ],
  exports: [ENVIRONMENT, DatabaseService, JobsService, MailService, StorageService],
})
export class InfrastructureModule {}
