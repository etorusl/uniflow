import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmailDto {
  @ApiProperty({ example: 'student@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Укажите корректный email.' })
  @MaxLength(254)
  email!: string;
}
export class LoginDto extends EmailDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
export class RegisterDto extends EmailDto {
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12, { message: 'Пароль должен содержать не менее 12 символов.' })
  @MaxLength(128)
  password!: string;
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  displayName!: string;
  @ApiProperty({ example: 'Asia/Novosibirsk' })
  @IsString()
  @MaxLength(100)
  timeZone!: string;
}
export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(43, 43)
  token!: string;
}
export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class ProfileDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty()
  @IsString()
  @Length(2, 80)
  displayName!: string;
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  timeZone!: string;
}
export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() timeZone!: string;
}
export class SessionDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
  @ApiPropertyOptional({ description: 'In-memory CSRF token for cookie sessions' })
  csrfToken?: string;
  @ApiPropertyOptional({ description: 'Only returned at native login; store in SecureStore' })
  token?: string;
}
export class MessageDto {
  @ApiProperty() message!: string;
}
