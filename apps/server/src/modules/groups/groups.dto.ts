import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto.js';

export const groupRoles = ['OWNER', 'MODERATOR', 'MEMBER'] as const;
export type GroupRole = (typeof groupRoles)[number];
export const invitationPattern = /^[A-Z0-9_-]{20}$/i;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const provided = (_object: unknown, value: unknown) => value !== undefined;

export class GroupInputDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 100) subjectName!: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf(provided)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}
export class GroupDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() subjectName!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: groupRoles }) role!: GroupRole;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) linkedSubjectId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class GroupsPageDto {
  @ApiProperty({ type: [GroupDto] }) items!: GroupDto[];
  @ApiProperty() total!: number;
}
export class GroupMemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: groupRoles }) role!: GroupRole;
  @ApiProperty({ format: 'date-time' }) joinedAt!: string;
  @ApiProperty() blocked!: boolean;
}
export class GroupMembersPageDto {
  @ApiProperty({ type: [GroupMemberDto] }) items!: GroupMemberDto[];
  @ApiProperty() total!: number;
}
export class GroupMembersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ type: String, enum: ['ACTIVE', 'BLOCKED'], default: 'ACTIVE' })
  @IsIn(['ACTIVE', 'BLOCKED'])
  status: 'ACTIVE' | 'BLOCKED' = 'ACTIVE';
}
export class GroupRoleInputDto {
  @ApiProperty({ enum: ['MEMBER', 'MODERATOR'] })
  @IsIn(['MEMBER', 'MODERATOR'])
  role!: 'MEMBER' | 'MODERATOR';
}
export class TransferGroupInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}
export class GroupSubjectInputDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  subjectId!: string | null;
}
export class GroupJoinInputDto {
  @ApiProperty({ minLength: 20, maxLength: 20 })
  @Transform(trim)
  @IsString()
  @Matches(invitationPattern)
  code!: string;
}
export class GroupInvitationInputDto {
  @ApiPropertyOptional({ type: Number, default: 168, minimum: 1, maximum: 720 })
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 250 })
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(250)
  maxUses?: number;
}
export class GroupInvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) creatorId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revokedAt!: string | null;
  @ApiProperty() maxUses!: number;
  @ApiProperty() uses!: number;
  @ApiProperty() canRevoke!: boolean;
}
export class NewGroupInvitationDto extends GroupInvitationDto {
  @ApiProperty() code!: string;
  @ApiProperty() url!: string;
}
export class GroupInvitationsPageDto {
  @ApiProperty({ type: [GroupInvitationDto] }) items!: GroupInvitationDto[];
  @ApiProperty() total!: number;
}
