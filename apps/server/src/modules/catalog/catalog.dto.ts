import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubjectInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ example: '#6554D9' })
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;
}
export class SubjectDto extends SubjectInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
export class TeacherInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
export class TeacherDto extends TeacherInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
export class SubjectsPageDto {
  @ApiProperty({ type: [SubjectDto] }) items!: SubjectDto[];
  @ApiProperty() total!: number;
}
export class TeachersPageDto {
  @ApiProperty({ type: [TeacherDto] }) items!: TeacherDto[];
  @ApiProperty() total!: number;
}
