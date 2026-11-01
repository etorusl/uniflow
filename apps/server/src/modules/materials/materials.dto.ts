import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, MaxLength, Min } from 'class-validator';
export class MaterialInputDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  title!: string;
  @ApiProperty() @IsString() @MaxLength(10000) body!: string;
}
export class MaterialUpdateDto extends MaterialInputDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class MaterialDto extends MaterialInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) groupId!: string;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canDelete!: boolean;
}
export class MaterialsPageDto {
  @ApiProperty({ type: [MaterialDto] }) items!: MaterialDto[];
  @ApiProperty() total!: number;
}
