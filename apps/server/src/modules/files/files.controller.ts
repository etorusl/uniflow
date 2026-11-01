import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import {
  AttachmentDto,
  FileParentDto,
  FilesPageDto,
  FilesQueryDto,
  parentTypes,
} from './files.dto.js';
import { FilesService } from './files.service.js';
import { MAX_FILE_BYTES } from './file-policy.js';
@ApiTags('Files')
@UseGuards(SessionGuard)
@Controller('files')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}
  @Get() @ApiOkResponse({ type: FilesPageDto }) list(
    @CurrentUser() u: UserDto,
    @Query() q: FilesQueryDto,
  ) {
    return this.files.list(u.id, q);
  }
  @Post()
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'parentType', 'parentId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        parentType: { type: 'string', enum: [...parentTypes] },
        parentId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOkResponse({ type: AttachmentDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 100 },
    }),
  )
  upload(
    @CurrentUser() u: UserDto,
    @Body() b: FileParentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.files.upload(u.id, b, file);
  }
  @Get(':id') @ApiOkResponse({ type: AttachmentDto }) get(
    @CurrentUser() u: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.get(u.id, id);
  }
  @Get(':id/content')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async content(
    @CurrentUser() u: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const { metadata, bytes } = await this.files.content(u.id, id);
    response.setHeader('content-type', metadata.mimeType);
    response.setHeader(
      'content-disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(metadata.filename).replace(/'/g, '%27')}`,
    );
    response.setHeader('cache-control', 'private, no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.send(bytes);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() u: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.remove(u.id, id);
  }
}
