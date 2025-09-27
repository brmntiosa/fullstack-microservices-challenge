import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CLIENTS } from '../shared/tokens';
import { Logger } from '@nestjs/common';
import type { Clients } from '../shared/clients.provider';
const logger = new Logger('ProductsService');

type OrderCreatedEvt = {
  orderId: number;
  productId: number;
  qty: number;
  totalPrice: number;
  createdAt: string;
};

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(@Inject(CLIENTS) private readonly c: Clients) {}

  async onModuleInit() {
    // Subscribe to order.created → reduce qty
    const ex = process.env.RABBIT_EXCHANGE ?? 'orders';
    const queue = 'product-service__order-created';

    await this.c.amqpChannel.assertQueue(queue, { durable: true });
    await this.c.amqpChannel.bindQueue(queue, ex, 'order.created');

    await this.c.amqpChannel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as OrderCreatedEvt;
        const productId = Number(payload.productId);
        const qty = Number(payload.qty);

        if (Number.isNaN(productId) || Number.isNaN(qty)) {
          // gunakan gaya log Fastify/Pino: object payload
          // (jika perlu akses logger Nest, bisa via Logger)
          console.warn({ msg: 'Invalid order.created payload', payload });
          this.c.amqpChannel.ack(msg);
          return;
        }

        await this.c.prisma.product.update({
          where: { id: productId },
          data:  { qty: { decrement: qty } },
        });

        await this.c.redis.del(`product:${productId}`); // invalidate cache
        this.c.amqpChannel.ack(msg);
      } catch (e) {
        console.error(e);
        this.c.amqpChannel.nack(msg, false, true); // requeue
      }
    }, { noAck: false });
  }

  async create(dto: { name: string; price: number; qty: number }) {
    const created = await this.c.prisma.product.create({ data: dto });
    // optional: publish product.created (boleh dihapus jika tak diperlukan)
    await this.c.amqpChannel.publish(
      process.env.RABBIT_EXCHANGE ?? 'orders',
      'product.created',
      Buffer.from(JSON.stringify(created)),
    );
    return created;
  }

  async getById(id: number) {
    const key = `product:${id}`;
    const cached = await this.c.redis.get(key);
    if (cached){
        logger.log(`cache HIT ${key}`);
        return JSON.parse(cached);
    } 

    logger.log(`cache MISS ${key}`);
    const data = await this.c.prisma.product.findUnique({ where: { id } });
    if (data) await this.c.redis.set(key, JSON.stringify(data), 'EX', 60);
    return data;
  }

  async getAll() {
    return this.c.prisma.product.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async update(id: number, dto: Partial<{ name: string; price: number; qty: number }>) {
    const updated = await this.c.prisma.product.update({
      where: { id },
      data: dto,
    });
    await this.c.redis.del(`product:${id}`); // invalidate cache detail
    return updated;
  }
  
  async remove(id: number) {
    const deleted = await this.c.prisma.product.delete({ where: { id } });
    await this.c.redis.del(`product:${id}`); // invalidate cache detail
    return deleted;
  }
}
