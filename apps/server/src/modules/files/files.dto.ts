import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto.js';
export const parentTypes = ['PERSONAL_TASK', 'GROUP_TASK', 'MATERIAL'] as const;
export type ParentType = (typeof parentTypes)[number];
export class FileParentDto {
  @ApiProperty({ enum: parentTypes, type: String }) @IsIn(parentTypes) parentType!: ParentType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() parentId!: string;
}
export class FilesQueryDto extends PaginationDto {
  @ApiProperty({ enum: parentTypes, type: String }) @IsIn(parentTypes) parentType!: ParentType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() parentId!: string;
}
export class AttachmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() byteSize!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class FilesPageDto {
  @ApiProperty({ type: [AttachmentDto] }) items!: AttachmentDto[];
  @ApiProperty() total!: number;
}
