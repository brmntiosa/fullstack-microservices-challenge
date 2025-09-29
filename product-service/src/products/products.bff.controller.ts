import { Controller, Get, Param, ParseIntPipe, Req } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ProductsService } from './products.service';

type OrderDto = {
  id: number;
  productId: number;
  qty: number;
  totalPrice: number;
  status: string;
  createdAt: string;
};

@Controller('products')
export class ProductsBffController {
  constructor(
    private readonly svc: ProductsService,
    private readonly http: HttpService,
  ) {}

  @Get(':id-with-orders')
  async getWithOrders(
    @Param('id', ParseIntPipe) id: number,
    @Req() req?: any, // <- biarkan fleksibel (Fastify/Express), boleh undefined saat unit test
  ) {
    const product = await this.svc.getById(id);
    const ordersBase = process.env.ORDERS_BASE ?? 'http://order-service:4000';

    // Interceptor kita menambahkan req.requestId; kalau tidak ada, biarkan undefined
    const rid: string | undefined = req?.requestId;

    try {
      const resp = await lastValueFrom(
        this.http.get<OrderDto[]>(`${ordersBase}/orders/product/${id}`, {
          headers: rid ? { 'X-Request-ID': rid } : undefined,
          timeout: 2500,
        }),
      );
      const orders = Array.isArray(resp.data) ? resp.data : [];
      return { product, orders };
    } catch {
      return { product, orders: [] };
    }
  }
}
