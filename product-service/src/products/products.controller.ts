import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.svc.create(dto);
  }

  @Get()
  getAll() {
    return this.svc.getAll();
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    // Coerce untuk unit test yang memanggil langsung tanpa pipeline
    const n = typeof id === 'number' ? id : Number(id);
    if (Number.isNaN(n)) throw new BadRequestException('Invalid id');
    return this.svc.getById(n);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateProductDto>,
  ) {
    const n = typeof id === 'number' ? id : Number(id);
    if (Number.isNaN(n)) throw new BadRequestException('Invalid id');
    return this.svc.update(n, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    const n = typeof id === 'number' ? id : Number(id);
    if (Number.isNaN(n)) throw new BadRequestException('Invalid id');
    return this.svc.remove(n);
  }
}
