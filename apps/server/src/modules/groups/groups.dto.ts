import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

export class GroupInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  name!: string;
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  subjectName!: string;
  @ApiProperty() @IsString() @MaxLength(3000) description!: string;
}
export class GroupDto extends GroupInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['OWNER', 'MODERATOR', 'MEMBER'] }) role!: 'OWNER' | 'MODERATOR' | 'MEMBER';
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) subjectId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class GroupsPageDto {
  @ApiProperty({ type: [GroupDto] }) items!: GroupDto[];
  @ApiProperty() total!: number;
}
export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['OWNER', 'MODERATOR', 'MEMBER'] }) role!: 'OWNER' | 'MODERATOR' | 'MEMBER';
}
export class MembersPageDto {
  @ApiProperty({ type: [MemberDto] }) items!: MemberDto[];
  @ApiProperty() total!: number;
}
export class RoleInputDto {
  @ApiProperty({ enum: ['MODERATOR', 'MEMBER'] }) @IsIn(['MODERATOR', 'MEMBER']) role!:
    'MODERATOR' | 'MEMBER';
}
export class TransferInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}
export class SubjectLinkDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;
}
export class InvitationInputDto {
  @ApiPropertyOptional({ type: Number, default: 7 }) @IsInt() @Min(1) @Max(30) expiresInDays = 7;
  @ApiPropertyOptional({ type: Number, default: 20 }) @IsInt() @Min(1) @Max(100) maxUses = 20;
}
export class JoinInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[0-9A-F]{24}$/)
  code!: string;
}
export class InvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) revokedAt!: string | null;
  @ApiProperty() maxUses!: number;
  @ApiProperty() uses!: number;
}
export class InvitationSecretDto extends InvitationDto {
  @ApiProperty() code!: string;
  @ApiProperty() url!: string;
}
export class InvitationsPageDto {
  @ApiProperty({ type: [InvitationDto] }) items!: InvitationDto[];
  @ApiProperty() total!: number;
}
export class AuditDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) targetId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class AuditPageDto {
  @ApiProperty({ type: [AuditDto] }) items!: AuditDto[];
  @ApiProperty() total!: number;
}
