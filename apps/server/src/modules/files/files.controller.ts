import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Response } from 'express';
import { finalize } from 'rxjs';
import { PaginationDto } from '../../common/pagination.dto.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { UserDto } from '../auth/auth.dto.js';
import { CurrentUser, SessionGuard, type AuthenticatedRequest } from '../auth/session.guard.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import {
  attachmentDisposition,
  MAX_FILE_BYTES,
  targetKinds,
  type TargetKind,
  type UploadedAttachment,
} from './file-validation.js';
import {
  AttachmentDto,
  AttachmentsDto,
  GroupMaterialDto,
  GroupMaterialInputDto,
  GroupMaterialsPageDto,
  UploadAttachmentBodyDto,
} from './files.dto.js';
import { FilesService } from './files.service.js';
import { GroupMaterialsService } from './group-materials.service.js';

function target(kind: unknown, id: unknown) {
  if (
    typeof kind !== 'string' ||
    !targetKinds.some((value) => value === kind) ||
    typeof id !== 'string' ||
    !isUUID(id)
  )
    throw new BadRequestException('Укажите поддерживаемый тип и идентификатор публикации.');
  return { kind: kind as TargetKind, id };
}

@Injectable()
export class AttachmentUploadGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AttachmentAccessService) private readonly access: AttachmentAccessService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.access.require(
      this.db,
      target(request.params.kind, request.params.parentId),
      request.auth.user.id,
      true,
      false,
    );
    return true;
  }
}

@Injectable()
export class UploadCapacityInterceptor implements NestInterceptor {
  private active = 0;

  intercept(_context: ExecutionContext, next: CallHandler) {
    // FileInterceptor buffers at most 10 MiB per request. Bound total process memory too.
    if (this.active >= 8) throw new ServiceUnavailableException();
    this.active++;
    return next.handle().pipe(finalize(() => this.active--));
  }
}

@ApiTags('Files')
@UseGuards(SessionGuard)
@Controller('files')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Get('targets/:kind/:parentId')
  @ApiParam({ name: 'kind', enum: [...targetKinds] })
  @ApiOkResponse({ type: AttachmentsDto })
  list(
    @CurrentUser() user: UserDto,
    @Param('kind') kind: string,
    @Param('parentId', ParseUUIDPipe) id: string,
  ) {
    return this.files.list(user.id, target(kind, id));
  }

  @Post('targets/:kind/:parentId')
  @UseGuards(AttachmentUploadGuard)
  @UseInterceptors(
    UploadCapacityInterceptor,
    FileInterceptor('file', {
      defParamCharset: 'utf8',
      limits: { parts: 3, fields: 1, fieldSize: 1024, files: 1, fileSize: MAX_FILE_BYTES + 1 },
    }),
  )
  @ApiParam({ name: 'kind', enum: [...targetKinds] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', maxLength: 240 },
      },
    },
  })
  @ApiCreatedResponse({ type: AttachmentDto })
  upload(
    @CurrentUser() user: UserDto,
    @Param('kind') kind: string,
    @Param('parentId', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @Body() body: UploadAttachmentBodyDto,
  ) {
    if (!file) throw new BadRequestException('Выберите непустой файл.');
    return this.files.upload(user.id, target(kind, id), file, body.name);
  }

  @Get(':id/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async content(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { file, stream } = await this.files.content(user.id, id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.on('close', () => stream.destroy());
    return new StreamableFile(stream, {
      type: file.mimeType,
      length: file.size,
      disposition: attachmentDisposition(file.name),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: UserDto, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.remove(user.id, id);
  }
}

@ApiTags('Group materials')
@UseGuards(SessionGuard)
@Controller('groups/:groupId/materials')
export class GroupMaterialsController {
  constructor(@Inject(GroupMaterialsService) private readonly materials: GroupMaterialsService) {}

  @Get()
  @ApiOkResponse({ type: GroupMaterialsPageDto })
  list(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: PaginationDto,
  ) {
    return this.materials.list(groupId, user.id, query);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupMaterialDto })
  create(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: GroupMaterialInputDto,
  ) {
    return this.materials.create(groupId, user.id, input);
  }

  @Patch(':id')
  @ApiOkResponse({ type: GroupMaterialDto })
  update(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: GroupMaterialInputDto,
  ) {
    return this.materials.update(groupId, id, user.id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.materials.remove(groupId, id, user.id);
  }
}
