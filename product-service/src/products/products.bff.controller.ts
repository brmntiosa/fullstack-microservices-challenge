import { Controller, Get, Param, ParseIntPipe, Req } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ProductsService } from './products.service';
// (opsional) kalau kamu pakai Fastify:
import type { FastifyRequest } from 'fastify';

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

  // GET /products/:id-with-orders
  // Gabungkan product (local) + orders (order-service).
  // - Teruskan X-Request-ID untuk korelasi log
  // - Graceful: non-200 / timeout => orders: []
  @Get(':id-with-orders')
  async getWithOrders(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest, // atau: @Req() req: any
  ) {
    const product = await this.svc.getById(id);

    const ordersBase = process.env.ORDERS_BASE ?? 'http://order-service:4000';
    const rid = (req as any).requestId as string | undefined; // diisi oleh RequestIdInterceptor

    try {
      const resp = await lastValueFrom(
        this.http.get<OrderDto[]>(`${ordersBase}/orders/product/${id}`, {
          headers: {
            'X-Request-ID': rid ?? '',
            'Accept': 'application/json',
          },
          timeout: 2500,                     // ms
          validateStatus: () => true,        // jangan throw untuk non-2xx
        }),
      );

      const isOk = resp.status >= 200 && resp.status < 300;
      const orders = isOk && Array.isArray(resp.data) ? resp.data : [];
      return { product, orders };
    } catch {
      // network error / timeout
      return { product, orders: [] };
    }
  }
}
