import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorDto } from '../../common/api-error.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';
import { AuthService } from './auth.service.js';
import {
  EmailDto,
  LoginDto,
  MessageDto,
  ProfileDto,
  RegisterDto,
  ResetPasswordDto,
  SessionDto,
  UserDto,
} from './auth.dto.js';
import { RateLimitService } from './rate-limit.service.js';
import { CurrentUser, SessionGuard, type AuthenticatedRequest } from './session.guard.js';
import { csrfToken, SESSION_COOKIE, SESSION_DAYS } from './tokens.js';

@ApiTags('Account')
@ApiBadRequestResponse({ type: ApiErrorDto })
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}
  private async protect(request: Request, kind: string, email = '') {
    const origin = request.headers.origin;
    if (
      origin &&
      ![this.env.WEB_ORIGIN, this.env.WEB_ORIGIN.replace('localhost', '127.0.0.1')].includes(origin)
    )
      throw new ForbiddenException('Недопустимый источник запроса.');
    if (!request.is('application/json')) throw new ForbiddenException('Ожидается JSON-запрос.');
    await this.limits.consume(`auth:${request.ip}`, 100, 900);
    await this.limits.consume(`${kind}:${request.ip}:${email}`, kind === 'login' ? 10 : 5, 900);
  }
  @Post('register')
  @HttpCode(200)
  @ApiOkResponse({ type: MessageDto })
  async register(@Body() input: RegisterDto, @Req() request: Request): Promise<MessageDto> {
    await this.protect(request, 'register', input.email);
    await this.auth.register(input);
    return { message: 'Аккаунт создан. Можно войти.' };
  }
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    await this.protect(request, 'login', input.email);
    const result = await this.auth.login(input);
    if (request.header('x-uniflow-client') === 'native')
      return { user: result.user, token: result.token };
    response.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_DAYS * 86400_000,
    });
    return { user: result.user, csrfToken: csrfToken(result.token) };
  }
  @Get('session')
  @UseGuards(SessionGuard)
  @ApiOkResponse({ type: SessionDto })
  session(@Req() request: AuthenticatedRequest): SessionDto {
    return { user: request.auth.user, csrfToken: request.auth.csrfToken };
  }
  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOkResponse({ type: MessageDto })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageDto> {
    await this.db.session.deleteMany({ where: { id: request.auth.sessionId } });
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      path: '/',
    });
    return { message: 'Вы вышли из аккаунта.' };
  }
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOkResponse({ type: MessageDto })
  async forgot(@Body() input: EmailDto, @Req() request: Request): Promise<MessageDto> {
    await this.protect(request, 'forgot', input.email);
    await this.auth.requestEmail(input.email, 'RESET_PASSWORD');
    return { message: 'Если аккаунт существует, письмо для восстановления будет отправлено.' };
  }
  @Post('reset-password')
  @HttpCode(200)
  @ApiOkResponse({ type: MessageDto })
  async reset(@Body() input: ResetPasswordDto, @Req() request: Request): Promise<MessageDto> {
    await this.protect(request, 'reset');
    await this.auth.consumeToken(input.token, 'RESET_PASSWORD', input.password);
    return { message: 'Пароль изменён. Войдите с новым паролем.' };
  }
}
@ApiTags('Profile')
@UseGuards(SessionGuard)
@Controller('users')
export class UsersController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Patch('me')
  @ApiOkResponse({ type: UserDto })
  update(@CurrentUser() user: UserDto, @Body() input: ProfileDto): Promise<UserDto> {
    return this.auth.updateProfile(user.id, input);
  }
}
