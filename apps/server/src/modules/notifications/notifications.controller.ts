import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { PushTransport } from '../../generated/prisma/enums.js';
import { type AuthenticatedRequest, SessionGuard } from '../auth/session.guard.js';
import {
  NotificationInboxDto,
  PUSH_TRANSPORTS,
  RegisterPushDto,
  ReminderSettingsDto,
  ReminderSettingsInputDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@UseGuards(SessionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notices: NotificationsService) {}

  @Get('settings')
  @ApiOkResponse({ type: ReminderSettingsDto })
  settings(@Req() { auth }: AuthenticatedRequest) {
    return this.notices.settings(auth.user.id, auth.sessionId);
  }

  @Patch('settings')
  @ApiOkResponse({ type: ReminderSettingsDto })
  changeSettings(@Req() { auth }: AuthenticatedRequest, @Body() input: ReminderSettingsInputDto) {
    return this.notices.changeSettings(auth.user.id, auth.sessionId, input);
  }

  @Post('subscriptions')
  @HttpCode(204)
  @ApiNoContentResponse()
  register(@Req() { auth }: AuthenticatedRequest, @Body() input: RegisterPushDto) {
    return this.notices.register(auth.user.id, auth.sessionId, input);
  }

  @Delete('subscriptions/:transport')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiParam({ name: 'transport', enum: PUSH_TRANSPORTS })
  unsubscribe(
    @Req() { auth }: AuthenticatedRequest,
    @Param('transport', new ParseEnumPipe(PushTransport)) transport: PushTransport,
  ) {
    return this.notices.unsubscribe(auth.user.id, auth.sessionId, transport);
  }

  @Get('inbox')
  @ApiOkResponse({ type: NotificationInboxDto })
  inbox(@Req() { auth }: AuthenticatedRequest) {
    return this.notices.inbox(auth.user.id);
  }

  @Post('inbox/:id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(@Req() { auth }: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.notices.read(auth.user.id, id);
  }
}
