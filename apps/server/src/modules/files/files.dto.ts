import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UploadAttachmentBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string;
}

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() size!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AttachmentsDto {
  @ApiProperty({ type: [AttachmentDto] }) items!: AttachmentDto[];
}

export class GroupMaterialInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10000)
  description!: string;
}

export class GroupMaterialDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) groupId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) authorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) authorName!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() attachmentCount!: number;
}

export class GroupMaterialsPageDto {
  @ApiProperty({ type: [GroupMaterialDto] }) items!: GroupMaterialDto[];
  @ApiProperty() total!: number;
}
