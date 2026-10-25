import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { hashToken } from './tokens.js';

@Injectable()
export class RateLimitService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async consume(key: string, limit: number, seconds: number) {
    const digest = hashToken(key);
    const now = new Date();
    const until = new Date(now.getTime() + seconds * 1000);
    const rows = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO auth_rate_limits (key, count, "windowEndsAt") VALUES (${digest}, 1, ${until})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_rate_limits."windowEndsAt" <= ${now} THEN 1 ELSE auth_rate_limits.count + 1 END,
        "windowEndsAt" = CASE WHEN auth_rate_limits."windowEndsAt" <= ${now} THEN ${until} ELSE auth_rate_limits."windowEndsAt" END
      RETURNING count`;
    if ((rows[0]?.count ?? limit + 1) > limit)
      throw new HttpException(
        'Слишком много попыток. Попробуйте позже.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
