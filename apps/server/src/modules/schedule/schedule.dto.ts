import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class SemesterInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStartDate!: string;
  @ApiProperty() @IsString() @Length(1, 100) timeZone!: string;
}
export class SemesterDto extends SemesterInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
export class SemestersPageDto {
  @ApiProperty({ type: [SemesterDto] }) items!: SemesterDto[];
  @ApiProperty() total!: number;
}
export class EntryInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() semesterId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() subjectId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsUUID() teacherId?:
    string | null;
  @ApiProperty({ minimum: 1, maximum: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;
  @ApiProperty({ example: '09:00' }) @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @ApiProperty({ example: '10:30' }) @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @ApiProperty({ enum: ['ALL', 'EVEN', 'ODD'] }) @IsIn(['ALL', 'EVEN', 'ODD']) parity!:
    'ALL' | 'EVEN' | 'ODD';
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  room?: string | null;
}
export class EntryDto extends EntryInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
export class EntriesPageDto {
  @ApiProperty({ type: [EntryDto] }) items!: EntryDto[];
  @ApiProperty() total!: number;
}
export class OccurrencesQueryDto {
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
}
export class ExceptionInputDto {
  @ApiProperty() @IsBoolean() cancelled!: boolean;
  @ApiPropertyOptional({ format: 'date' })
  @ValidateIf((value: ExceptionInputDto) => !value.cancelled)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  replacementDate?: string;
  @ApiPropertyOptional()
  @ValidateIf((value: ExceptionInputDto) => !value.cancelled)
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;
  @ApiPropertyOptional()
  @ValidateIf((value: ExceptionInputDto) => !value.cancelled)
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}
export class OccurrenceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'uuid' }) entryId!: string;
  @ApiProperty({ format: 'uuid' }) semesterId!: string;
  @ApiProperty() subjectName!: string;
  @ApiProperty() color!: string;
  @ApiProperty({ nullable: true, type: String }) teacherName!: string | null;
  @ApiProperty({ nullable: true, type: String }) room!: string | null;
  @ApiProperty({ format: 'date' }) originalDate!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty() cancelled!: boolean;
  @ApiProperty() moved!: boolean;
  @ApiProperty() weekNumber!: number;
}
export class OccurrencesDto {
  @ApiProperty({ type: [OccurrenceDto] }) items!: OccurrenceDto[];
}
