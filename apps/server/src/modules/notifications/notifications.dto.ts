import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export const PUSH_TRANSPORTS = ['WEB', 'ANDROID'] as const;
export type PushTransportValue = (typeof PUSH_TRANSPORTS)[number];

export class ReminderSettingsInputDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ minimum: 1, maximum: 10080 })
  @IsInt()
  @Min(1)
  @Max(10080)
  minutesBefore!: number;
}

export class ReminderSettingsDto extends ReminderSettingsInputDto {
  @ApiProperty() androidAvailable!: boolean;
  @ApiProperty() webAvailable!: boolean;
  @ApiProperty({ type: String, nullable: true }) webPublicKey!: string | null;
  @ApiProperty({ enum: PUSH_TRANSPORTS, isArray: true }) subscribed!: PushTransportValue[];
}

export class RegisterPushDto {
  @ApiProperty({ enum: PUSH_TRANSPORTS }) @IsIn(PUSH_TRANSPORTS) transport!: PushTransportValue;
  @ApiProperty() @IsString() @Length(20, 2048) address!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(87, 87) p256dh?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(22, 22) auth?: string;
  @ApiPropertyOptional({ description: 'Обновляет только активную подписку текущей сессии.' })
  @IsOptional()
  @IsBoolean()
  refreshOnly?: boolean;
}

export class NotificationNoticeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['PERSONAL', 'GROUP'] }) kind!: 'PERSONAL' | 'GROUP';
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) groupId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) scheduledAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: string | null;
}

export class NotificationInboxDto {
  @ApiProperty({ type: [NotificationNoticeDto] }) items!: NotificationNoticeDto[];
  @ApiProperty() unreadCount!: number;
}
