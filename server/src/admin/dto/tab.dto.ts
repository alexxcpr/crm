import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTabDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]{1,50}$/, {
    message: 'Slug-ul poate contine doar litere mici, cifre, _ si trebuie sa inceapa cu o litera.',
  })
  slug: string;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}

export class UpdateTabDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]{1,50}$/, {
    message: 'Slug-ul poate contine doar litere mici, cifre, _ si trebuie sa inceapa cu o litera.',
  })
  slug?: string;

  @IsOptional()
  @IsInt()
  rank?: number;
}
