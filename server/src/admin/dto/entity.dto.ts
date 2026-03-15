import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, IsInt } from 'class-validator';

export class CreateEntityDto {
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
    @IsUUID()
    id_module?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    icon?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    label_singular?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    label_plural?: string;

    @IsOptional()
    @IsInt()
    rank?: number;
}

export class UpdateEntityDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsUUID()
    id_module?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    icon?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    label_singular?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    label_plural?: string;

    @IsOptional()
    @IsInt()
    rank?: number;
}