import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsNumber() @IsPositive()  price!: number;
  @IsInt() qty!: number;
}
