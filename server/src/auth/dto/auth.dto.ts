import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AuthDto {
    @IsString()
    @IsNotEmpty()
    loginUsername: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

export class SwitchProfileDto {
  @IsString()
  @IsNotEmpty()
  profileId: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
