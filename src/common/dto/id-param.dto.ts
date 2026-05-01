import { IsString, Matches } from 'class-validator';

export class IdParamDto {
  @IsString()
  @Matches(/^c[a-z0-9]+$/, {
    message: 'Invalid CUID format',
  })
  id: string;
}
