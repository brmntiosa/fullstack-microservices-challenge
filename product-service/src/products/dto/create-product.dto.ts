import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price!: number;      

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;        
}
