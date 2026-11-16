import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto.js';
import { TaskDto, TaskEventDto, TaskInputDto } from '../tasks/tasks.dto.js';

const groupModes = ['INDIVIDUAL', 'SHARED'] as const;
export type GroupMode = (typeof groupModes)[number];
export class GroupTaskInputDto extends PickType(TaskInputDto, [
  'title',
  'description',
  'dueAt',
] as const) {}
export class NewGroupTaskInputDto extends GroupTaskInputDto {
  @ApiProperty({ enum: groupModes }) @IsIn(groupModes) mode!: GroupMode;
}
export class GroupTasksQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['ALL', 'OPEN', 'COMPLETED', 'OVERDUE'],
    default: 'OPEN',
  })
  @IsIn(['ALL', 'OPEN', 'COMPLETED', 'OVERDUE'])
  status: 'ALL' | 'OPEN' | 'COMPLETED' | 'OVERDUE' = 'OPEN';
  @ApiPropertyOptional({ type: String, enum: groupModes })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(groupModes)
  mode?: GroupMode;
}
export class AccessibleGroupTasksQueryDto extends GroupTasksQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  groupId?: string;
}
export class GroupTaskDto extends PickType(TaskDto, [
  'id',
  'title',
  'description',
  'dueAt',
  'deadlineRevision',
  'completedAt',
  'deadlineAtCompletion',
  'status',
] as const) {
  @ApiProperty({ format: 'uuid' }) groupId!: string;
  @ApiProperty() groupName!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) authorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) authorName!: string | null;
  @ApiProperty({ enum: groupModes }) mode!: GroupMode;
  @ApiProperty() canComplete!: boolean;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canDelete!: boolean;
}
export class GroupTasksPageDto {
  @ApiProperty({ type: [GroupTaskDto] }) items!: GroupTaskDto[];
  @ApiProperty() total!: number;
}
export class GroupTaskEventDto extends TaskEventDto {
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
}
export class GroupTaskHistoryDto {
  @ApiProperty({ type: [GroupTaskEventDto] }) items!: GroupTaskEventDto[];
  @ApiProperty() total!: number;
}
