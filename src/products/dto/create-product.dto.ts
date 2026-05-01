import { IsArray, IsInt, IsNumber, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  itemCode!: string;

  @IsString()
  unit!: string;

  @IsNumber()
  stock!: number;

  @IsNumber()
  minStock!: number;

  @IsString()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  images!: string[];
}
