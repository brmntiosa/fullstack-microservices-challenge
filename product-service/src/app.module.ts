import { Module } from '@nestjs/common';
import { ClientsModule } from './shared/clients.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [ClientsModule, ProductsModule],
})
export class AppModule {}
