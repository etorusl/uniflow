import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto.js';

export class TaskInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  title!: string;
  @ApiProperty() @IsString() @MaxLength(5000) description!: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;
}
export class TasksQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['ALL', 'OPEN', 'COMPLETED', 'OVERDUE'],
    default: 'OPEN',
  })
  @IsIn(['ALL', 'OPEN', 'COMPLETED', 'OVERDUE'])
  status: 'ALL' | 'OPEN' | 'COMPLETED' | 'OVERDUE' = 'OPEN';
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() subjectId?: string;
}
export class TaskDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'date-time' }) dueAt!: string;
  @ApiProperty() deadlineRevision!: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) subjectId!: string | null;
  @ApiProperty({ type: String, nullable: true }) subjectName!: string | null;
  @ApiProperty({ type: String, nullable: true }) subjectColor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deadlineAtCompletion!:
    string | null;
  @ApiProperty({ enum: ['OPEN', 'OVERDUE', 'COMPLETED_ON_TIME', 'COMPLETED_LATE'] }) status!:
    'OPEN' | 'OVERDUE' | 'COMPLETED_ON_TIME' | 'COMPLETED_LATE';
}
export class TasksPageDto {
  @ApiProperty({ type: [TaskDto] }) items!: TaskDto[];
  @ApiProperty() total!: number;
}
export class TaskEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['COMPLETED', 'REOPENED'] }) kind!: 'COMPLETED' | 'REOPENED';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) deadlineSnapshot!: string;
}
export class TaskHistoryDto {
  @ApiProperty({ type: [TaskEventDto] }) items!: TaskEventDto[];
}
export class StatisticsDto {
  @ApiProperty() total!: number;
  @ApiProperty() open!: number;
  @ApiProperty() completedOnTime!: number;
  @ApiProperty() completedLate!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() completionRate!: number;
}
