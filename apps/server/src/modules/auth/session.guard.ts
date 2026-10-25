import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';
import type { UserDto } from './auth.dto.js';
import { presentUser } from './auth.service.js';
import { csrfToken, hashToken, sameToken, SESSION_COOKIE } from './tokens.js';

export type AuthenticatedRequest = Request & {
  auth: { user: UserDto; sessionId: string; csrfToken?: string };
};
function cookieValue(request: Request) {
  const pair = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return pair?.slice(SESSION_COOKIE.length + 1);
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const token = bearer ?? cookieValue(request);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException('Войдите в аккаунт.');
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException('Сессия истекла. Войдите снова.');
    const csrf = bearer ? undefined : csrfToken(token);
    if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origins = [this.env.WEB_ORIGIN, this.env.WEB_ORIGIN.replace('localhost', '127.0.0.1')];
      if (
        !origins.includes(request.headers.origin ?? '') ||
        !sameToken(request.header('x-csrf-token'), csrf!)
      )
        throw new ForbiddenException('Не удалось подтвердить запрос. Обновите страницу.');
    }
    request.auth = { user: presentUser(session.user), sessionId: session.id, csrfToken: csrf };
    return true;
  }
}
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth.user,
);
