import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class RankedItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(0)
  rank: number;
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: RankedItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => RankedItemDto)
  items: RankedItemDto[];
}
