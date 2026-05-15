import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DownloadFileEntryDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}

export class DownloadFilesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DownloadFileEntryDto)
  files!: DownloadFileEntryDto[];
}
