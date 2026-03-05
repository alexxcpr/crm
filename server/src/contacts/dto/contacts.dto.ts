import { IsBoolean, IsOptional, IsEmail, IsNotEmpty, IsString, ValidateIf } from "class-validator"

export class ContactDto {
    @IsNotEmpty()
    @IsString()
    nume: string;
    @IsNotEmpty()
    @IsString()
    prenume: string;

    @IsEmail()
    @IsNotEmpty()
    email_companie: string;
    @IsOptional()
    @ValidateIf(o => o.email_alternativ !== null && o.email_alternativ !== '')
    @IsEmail()
    email_alternativ: string | null;
    
    @IsOptional()
    @IsString()
    telefon1: string | null;
    @IsOptional()
    @IsString()
    telefon2: string | null;

    @IsOptional()
    @IsString()
    pozitie: string | null;

    @IsOptional()
    @IsString()
    profile_linkedin: string | null;

    @IsOptional()
    @IsBoolean()
    is_activ: boolean;
    
    @IsOptional()
    @IsBoolean()
    is_decision_maker: boolean;
}