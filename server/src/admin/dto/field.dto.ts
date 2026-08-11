import {
    IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional,
    IsString, IsUUID, Matches, MaxLength, ValidateIf, IsObject, IsArray, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const DATA_TYPES = ['varchar', 'text', 'integer', 'numeric', 'boolean', 'datetime', 'uuid'];
const UI_TYPES = [
    'text', 'textarea', 'number',
    'datepicker', 'datetimepicker', 'checkbox', 'relation',
    'email', 'phone', 'currency', 'file',
];
const RELATION_KINDS = ['reference', 'composition'];

export class SequenceManifestDto {
    @IsString()
    @Matches(/^[a-z][a-z0-9_]{1,50}$/, {
        message: 'Cheia secventei poate contine doar litere mici, cifre si _ si trebuie sa inceapa cu o litera.',
    })
    key: string;

    @IsIn(['global', 'entity'])
    scope: 'global' | 'entity';

    @IsIn(['none', 'yearly'])
    reset: 'none' | 'yearly';

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    format: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    prefix?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(18)
    padding?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(Number.MAX_SAFE_INTEGER)
    start_value?: number;
}

export class CreateFieldDto {
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

    @IsString()
    @IsIn(DATA_TYPES, { message: `data_type trebuie sa fie unul din: ${DATA_TYPES.join(', ')}` })
    data_type: string;

    @IsString()
    @IsIn(UI_TYPES, { message: `ui_type trebuie sa fie unul din: ${UI_TYPES.join(', ')}` })
    ui_type: string;

    @IsOptional()
    @IsString()
    default_value?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    placeholder?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    help_text?: string;

    @IsOptional()
    @IsArray()
    options?: { label: string; value: string }[];

    @IsOptional()
    @IsBoolean()
    is_required?: boolean;

    @IsOptional()
    @IsBoolean()
    is_unique?: boolean;

    @IsOptional()
    @IsBoolean()
    is_filterable?: boolean;

    @IsOptional()
    @IsBoolean()
    is_sortable?: boolean;

    @IsOptional()
    @IsBoolean()
    visible_in_table?: boolean;

    @IsOptional()
    @IsBoolean()
    visible_in_form?: boolean;

    @IsOptional()
    @IsBoolean()
    is_readonly?: boolean;

    @IsOptional()
    @IsObject()
    validation_rules?: Record<string, any>;

    @IsOptional()
    @ValidateNested()
    @Type(() => SequenceManifestDto)
    sequence?: SequenceManifestDto;

    @ValidateIf((o) => o.ui_type === 'relation')
    @IsUUID()
    @IsNotEmpty({ message: 'id_relation_entity este obligatoriu pentru campuri de tip relation.' })
    id_relation_entity?: string;

    @ValidateIf((o) => o.ui_type === 'relation')
    @IsString()
    @IsNotEmpty({ message: 'relation_display_field este obligatoriu pentru campuri de tip relation.' })
    @MaxLength(100)
    @Matches(/^[a-z][a-z0-9_]{1,99}$/, {
        message: 'relation_display_field poate contine doar litere mici, cifre si _ si trebuie sa inceapa cu o litera.',
    })
    relation_display_field?: string;

    @ValidateIf((o) => o.ui_type === 'relation')
    @IsIn(RELATION_KINDS)
    relation_kind?: 'reference' | 'composition';

    @IsOptional()
    @IsUUID()
    id_ui_tab?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    rank?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(3)
    grid_col?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(3)
    col_span?: number;
}

export class UpdateFieldDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    // ui_type EDITABIL — doar schimba renderul in UI, coloana SQL ramane la fel
    @IsOptional()
    @IsString()
    @IsIn(UI_TYPES, { message: `ui_type trebuie sa fie unul din: ${UI_TYPES.join(', ')}` })
    ui_type?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    placeholder?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    help_text?: string;

    @IsOptional()
    @IsArray()
    options?: { label: string; value: string }[];

    // relation fields — necesare cand schimbi ui_type in 'relation'
    @ValidateIf((o) => o.ui_type === 'relation')
    @IsUUID()
    id_relation_entity?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Matches(/^[a-z][a-z0-9_]{1,99}$/, {
        message: 'relation_display_field poate contine doar litere mici, cifre si _ si trebuie sa inceapa cu o litera.',
    })
    relation_display_field?: string;

    @IsOptional()
    @IsIn(RELATION_KINDS)
    relation_kind?: 'reference' | 'composition';

    @IsOptional()
    @IsBoolean()
    is_required?: boolean;

    @IsOptional()
    @IsBoolean()
    is_unique?: boolean;

    @IsOptional()
    @IsBoolean()
    is_filterable?: boolean;

    @IsOptional()
    @IsBoolean()
    is_sortable?: boolean;

    @IsOptional()
    @IsBoolean()
    visible_in_table?: boolean;

    @IsOptional()
    @IsBoolean()
    visible_in_form?: boolean;

    @IsOptional()
    @IsBoolean()
    is_readonly?: boolean;

    @IsOptional()
    @IsObject()
    validation_rules?: Record<string, any>;

    @IsOptional()
    @ValidateNested()
    @Type(() => SequenceManifestDto)
    sequence?: SequenceManifestDto | null;

    @IsOptional()
    @IsUUID()
    id_ui_tab?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    rank?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(3)
    grid_col?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(3)
    col_span?: number;

    @IsOptional()
    @IsString()
    default_value?: string;
}
