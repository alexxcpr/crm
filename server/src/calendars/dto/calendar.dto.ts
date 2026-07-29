import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CALENDAR_FILTER_OPERATORS,
  CALENDAR_LIST_RANGES,
  CALENDAR_LIMITS,
  CALENDAR_SLOT_DURATIONS,
  CALENDAR_VIEWS,
} from '../calendar.constants';

export class CalendarFilterDto {
  @IsUUID()
  id_field: string;

  @IsIn(CALENDAR_FILTER_OPERATORS)
  operator: string;

  @IsOptional()
  value?: unknown;
}

export class CalendarTitleSegmentDto {
  @IsIn(['text', 'field'])
  type: 'text' | 'field';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  value?: string;

  @IsOptional()
  @IsUUID()
  id_field?: string;
}

export class CalendarSourceDto {
  @IsOptional()
  @IsUUID()
  id_ui_calendar_source?: string;

  @IsUUID()
  id_entity: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  color: string;

  @IsUUID()
  id_start_field: string;

  @IsUUID()
  id_end_field: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarTitleSegmentDto)
  title_segments: CalendarTitleSegmentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarFilterDto)
  filters: CalendarFilterDto[];

  @IsArray()
  @ArrayMaxSize(CALENDAR_LIMITS.popoverFields)
  @IsUUID(undefined, { each: true })
  popover_field_ids: string[];

  @IsBoolean()
  allow_create: boolean;

  @IsBoolean()
  allow_update: boolean;

  @IsInt()
  @Min(0)
  rank: number;

  @IsBoolean()
  is_active: boolean;
}

export class SaveCalendarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,99}$/)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsIn(CALENDAR_VIEWS)
  default_view: string;

  @IsBoolean()
  allow_day: boolean;

  @IsBoolean()
  allow_week: boolean;

  @IsBoolean()
  allow_month: boolean;

  @IsBoolean()
  allow_list: boolean;

  @IsIn(CALENDAR_LIST_RANGES)
  list_range: string;

  @IsInt()
  @Min(0)
  @Max(6)
  first_day: number;

  @IsBoolean()
  show_weekends: boolean;

  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  slot_min_time: string;

  @IsString()
  @Matches(
    /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/,
  )
  slot_max_time: string;

  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  scroll_time: string;

  @IsInt()
  @IsIn(CALENDAR_SLOT_DURATIONS)
  slot_duration_minutes: number;

  @IsInt()
  @Min(0)
  rank: number;

  @IsBoolean()
  is_active: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarSourceDto)
  sources: CalendarSourceDto[];
}

export class CalendarRuntimeFilterGroupDto {
  @IsUUID()
  source_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarFilterDto)
  filters: CalendarFilterDto[];
}

export class CalendarQueryDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  source_ids?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarRuntimeFilterGroupDto)
  filters?: CalendarRuntimeFilterGroupDto[];
}

export class UpdateCalendarIntervalDto {
  @IsString()
  @IsNotEmpty()
  start: string;

  @IsString()
  @IsNotEmpty()
  end: string;

  @IsBoolean()
  all_day: boolean;
}

export class PreviewCalendarDto {
  @ValidateNested()
  @Type(() => SaveCalendarDto)
  calendar: SaveCalendarDto;

  @ValidateNested()
  @Type(() => CalendarQueryDto)
  query: CalendarQueryDto;
}
