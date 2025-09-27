import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsBffController } from './products.bff.controller';



@Module({
  imports: [
    HttpModule.register({
      timeout: 2000,
      maxRedirects: 0,
    }),
  ],
  controllers: [ProductsController, ProductsBffController],
  providers: [ProductsService],
  exports: [ProductsService], 
})
export class ProductsModule {}
