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
  DASHBOARD_AGGREGATIONS,
  DASHBOARD_CHART_TYPES,
  DASHBOARD_DATE_GRANULARITIES,
  DASHBOARD_DATE_PRESETS,
  DASHBOARD_DATE_SOURCES,
  DASHBOARD_FILTER_OPERATORS,
  DASHBOARD_GROUP_MODES,
  DASHBOARD_LAYOUT_SPANS,
  DASHBOARD_LIMITS,
  DASHBOARD_VALUE_FORMATS,
  DASHBOARD_WIDGET_TYPES,
} from '../dashboard.constants';

export class DashboardFilterDto {
  @IsUUID()
  id_field: string;

  @IsIn(DASHBOARD_FILTER_OPERATORS)
  operator: string;

  @IsOptional()
  value?: unknown;
}

export class DashboardWidgetDto {
  @IsOptional()
  @IsUUID()
  id_ui_widget?: string;

  @IsIn(DASHBOARD_WIDGET_TYPES)
  widget_type: string;

  @IsOptional()
  @IsIn(DASHBOARD_CHART_TYPES)
  chart_type?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsUUID()
  id_entity: string;

  @IsIn(DASHBOARD_AGGREGATIONS)
  aggregation: string;

  @IsOptional()
  @IsUUID()
  id_value_field?: string | null;

  @IsOptional()
  @IsIn(DASHBOARD_GROUP_MODES)
  group_mode?: string | null;

  @IsOptional()
  @IsUUID()
  id_group_field?: string | null;

  @IsOptional()
  @IsUUID()
  id_series_field?: string | null;

  @IsOptional()
  @IsIn(DASHBOARD_DATE_SOURCES)
  date_source?: string | null;

  @IsOptional()
  @IsUUID()
  id_date_field?: string | null;

  @IsIn(DASHBOARD_DATE_GRANULARITIES)
  date_granularity: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  filters: DashboardFilterDto[];

  @IsBoolean()
  comparison_enabled: boolean;

  @IsIn(DASHBOARD_VALUE_FORMATS)
  value_format: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency_code: string;

  @IsInt()
  @Min(1)
  @Max(DASHBOARD_LIMITS.categories)
  top_n: number;

  @IsInt()
  @IsIn(DASHBOARD_LAYOUT_SPANS)
  col_span: number;

  @IsInt()
  @Min(0)
  rank: number;

  @IsBoolean()
  drilldown_enabled: boolean;

  @IsBoolean()
  is_active: boolean;
}

export class DashboardBlockDto {
  @IsOptional()
  @IsUUID()
  id_ui_block?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string | null;

  @IsInt()
  @Min(0)
  rank: number;

  @IsBoolean()
  is_active: boolean;

  @IsArray()
  @ArrayMaxSize(DASHBOARD_LIMITS.widgets)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets: DashboardWidgetDto[];
}

export class SaveDashboardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,99}$/)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsIn(DASHBOARD_DATE_PRESETS)
  default_date_preset: string;

  @IsBoolean()
  is_default: boolean;

  @IsBoolean()
  is_active: boolean;

  @IsInt()
  @Min(0)
  rank: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardBlockDto)
  blocks: DashboardBlockDto[];
}

export class DashboardQueryDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  widgetIds?: string[];
}
