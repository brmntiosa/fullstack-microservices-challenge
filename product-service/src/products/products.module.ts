import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsBffController } from './products.bff.controller';

// Jika ProductsService butuh token dari ClientsModule dan module tsb TIDAK global,
// import juga ClientsModule di sini.
// import { ClientsModule } from '../shared/clients.module';

@Module({
  imports: [
    // ClientsModule, // ← uncomment kalau dibutuhkan
    HttpModule.register({
      timeout: 2000,
      maxRedirects: 0,
    }),
  ],
  controllers: [ProductsController, ProductsBffController],
  providers: [ProductsService],
  exports: [ProductsService], // opsional; berguna kalau dipakai module lain
})
export class ProductsModule {}
