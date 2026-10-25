import { randomUUID } from 'node:crypto';
import { ApiProperty } from '@nestjs/swagger';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export class ErrorDetailDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty() requestId!: string;
}
export class ApiErrorDto {
  @ApiProperty({ type: ErrorDetailDto }) error!: ErrorDetailDto;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = response.getHeader('x-request-id')?.toString() ?? randomUUID();
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const description =
      typeof body === 'string' ? body : (body as { message?: string | string[] } | null)?.message;
    const message =
      status >= 500
        ? 'Сервис временно недоступен. Повторите попытку позже.'
        : Array.isArray(description)
          ? description.join('; ')
          : (description ?? 'Не удалось выполнить запрос.');
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          event: 'request_failed',
          requestId,
          method: request.method,
          path: request.path,
          status,
        }),
      );
    response
      .status(status)
      .json({ error: { code: HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR', message, requestId } });
  }
}
