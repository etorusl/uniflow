import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { TaskInputDto, TaskEventDto } from '../tasks/tasks.dto.js';
export class GroupTaskCreateDto extends OmitType(TaskInputDto, ['subjectId'] as const) {
  @ApiProperty({ enum: ['INDIVIDUAL', 'SHARED'] }) @IsIn(['INDIVIDUAL', 'SHARED']) mode!:
    'INDIVIDUAL' | 'SHARED';
}
export class GroupTaskUpdateDto extends OmitType(TaskInputDto, ['subjectId'] as const) {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class GroupTaskEventDto extends TaskEventDto {
  @ApiProperty({ format: 'uuid' }) actorId!: string;
}
export class GroupTaskHistoryDto {
  @ApiProperty({ type: [GroupTaskEventDto] }) items!: GroupTaskEventDto[];
  @ApiProperty() total!: number;
}
