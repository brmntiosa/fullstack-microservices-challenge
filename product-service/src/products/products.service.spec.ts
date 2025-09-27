import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { CLIENTS } from '../shared/tokens';

/** ==== tipe bantu ==== */
type Product = { id: number; name: string; price: number; qty: number; createdAt: string };

type RedisGetFn = (key: string) => Promise<string | null>;
type RedisSetFn = (key: string, value: string, mode: 'EX', ttl: number) => Promise<any>;
type RedisDelFn = (key: string) => Promise<any>;

type PrismaCallFn<T = any> = (args: any) => Promise<T>;
// ==== type helper untuk AMQP channel ====
type AmqpPublishFn     = (exchange: string, routingKey: string, content: Buffer, options?: any) => boolean | Promise<boolean>;
type AmqpAssertQueueFn = (queue: string, options?: any) => Promise<any>;
type AmqpBindQueueFn   = (queue: string, source: string, pattern: string, args?: any) => Promise<void>;
type AmqpConsumeFn     = (queue: string, onMessage: (msg: any) => any, options?: any) => Promise<{ consumerTag: string }>;
type AmqpAckFn         = (msg: any, allUpTo?: boolean) => void;
type AmqpNackFn        = (msg: any, allUpTo?: boolean, requeue?: boolean) => void;

// ==== mocks (redeclare amqpChannel dengan tipe yang spesifik) ====
const amqpChannel = {
  publish:     jest.fn() as jest.MockedFunction<AmqpPublishFn>,
  assertQueue: jest.fn() as jest.MockedFunction<AmqpAssertQueueFn>,
  bindQueue:   jest.fn() as jest.MockedFunction<AmqpBindQueueFn>,
  consume:     jest.fn() as jest.MockedFunction<AmqpConsumeFn>,
  ack:         jest.fn() as jest.MockedFunction<AmqpAckFn>,
  nack:        jest.fn() as jest.MockedFunction<AmqpNackFn>,
};


/** ==== mocks ==== */
const redis = {
  get: jest.fn() as jest.MockedFunction<RedisGetFn>,
  set: jest.fn() as jest.MockedFunction<RedisSetFn>,
  del: jest.fn() as jest.MockedFunction<RedisDelFn>,
};

const prisma = {
  product: {
    findUnique: jest.fn() as jest.MockedFunction<PrismaCallFn<Product | null>>,
    create:     jest.fn() as jest.MockedFunction<PrismaCallFn<Product>>,
    update:     jest.fn() as jest.MockedFunction<PrismaCallFn<Product>>,
    delete:     jest.fn() as jest.MockedFunction<PrismaCallFn<Product>>,
    findMany:   jest.fn() as jest.MockedFunction<PrismaCallFn<Product[]>>,
  },
};

/**
 * Channel AMQP yang kita butuhkan hanya method-method ini.
 * Semua kita mock agar bisa di-spy & di-invoke manual.
 */

describe('ProductsService (cache + invalidate + events)', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: CLIENTS, useValue: { prisma, redis, amqpChannel } },
      ],
    }).compile();

    service = module.get(ProductsService);
  });
  
  it('getById → returns null when product absent', async () => {
    redis.get.mockResolvedValue(null);
    prisma.product.findUnique.mockResolvedValue(null);
  
    await expect(service.getById(999)).resolves.toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });
  
  it('create → tetap sukses walau publish event gagal (publish returns false)', async () => {
    const now = new Date().toISOString();
    prisma.product.create.mockResolvedValue({ id: 10, name: 'X', price: 1, qty: 1, createdAt: now });
  
    // Simulasikan kegagalan publish TANPA throw (hindari unhandled rejection)
    (amqpChannel.publish as any).mockResolvedValue(false);
  
    const res = await service.create({ name: 'X', price: 1, qty: 1 });
    expect(res.id).toBe(10);
    expect(amqpChannel.publish).toHaveBeenCalled();
  });
  

  it('MISS → query DB → set cache → return', async () => {
    redis.get.mockResolvedValue(null);
    prisma.product.findUnique.mockResolvedValue({
      id: 2, name: 'Mouse', price: 340000, qty: 100, createdAt: new Date().toISOString(),
    });

    const res = await service.getById(2);

    expect(redis.get).toHaveBeenCalledWith('product:2');
    expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ id: 2, name: 'Mouse' });
  });

  it('HIT → return from cache → no DB call', async () => {
    const cached = JSON.stringify({ id: 2, name: 'Mouse', price: 340000, qty: 100, createdAt: new Date().toISOString() });
    redis.get.mockResolvedValue(cached);

    const res = await service.getById(2);

    expect(redis.get).toHaveBeenCalledWith('product:2');
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 2, name: 'Mouse' });
  });

  it('update() → update DB lalu invalidate cache detail', async () => {
    (prisma.product.update as jest.MockedFunction<PrismaCallFn<Product>>).mockResolvedValue({
      id: 2, name: 'Mouse Pro', price: 450000, qty: 80, createdAt: new Date().toISOString(),
    });

    const res = await service.update(2, { name: 'Mouse Pro', price: 450000 });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { name: 'Mouse Pro', price: 450000 },
    });
    expect(redis.del).toHaveBeenCalledWith('product:2');
    expect(res).toMatchObject({ id: 2, name: 'Mouse Pro' });
  });

  it('remove() → delete di DB lalu invalidate cache detail', async () => {
    (prisma.product.delete as jest.MockedFunction<PrismaCallFn<Product>>).mockResolvedValue({
      id: 3, name: 'Headset', price: 250000, qty: 36, createdAt: new Date().toISOString(),
    });

    const res = await service.remove(3);

    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(redis.del).toHaveBeenCalledWith('product:3');
    expect(res).toMatchObject({ id: 3, name: 'Headset' });
  });

  /** === Tambahan 1: cover create() termasuk publish event === */
  it('create() → simpan DB dan publish event', async () => {
    (prisma.product.create as jest.MockedFunction<PrismaCallFn<Product>>).mockResolvedValue({
      id: 9, name: 'Webcam', price: 250000, qty: 10, createdAt: new Date().toISOString(),
    });

    const res = await service.create({ name: 'Webcam', price: 250000, qty: 10 });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { name: 'Webcam', price: 250000, qty: 10 },
    });

    // publish dipanggil dengan routing key 'product.created'
    expect(amqpChannel.publish).toHaveBeenCalledWith(
      expect.any(String),      // exchange (bisa 'orders' atau env override)
      'product.created',
      expect.any(Buffer),
    );
    expect(res).toMatchObject({ id: 9, name: 'Webcam' });
  });

  /** === Tambahan 2: cover onModuleInit() → consume order.created === */
  it('onModuleInit() → consume order.created → decrement qty & invalidate cache', async () => {
    const fakeMsg: any = {
      content: Buffer.from(JSON.stringify({
        orderId: 1,
        productId: 2,
        qty: 3,
        totalPrice: 1000,
        createdAt: new Date().toISOString(),
      })),
    };
  
    // mock consume: saat dipanggil, langsung trigger callback
    (amqpChannel.consume as jest.MockedFunction<AmqpConsumeFn>)
      .mockImplementation(async (_queue, cb) => {
        cb(fakeMsg);
        return { consumerTag: 'test' };
      });
  
    (prisma.product.update as jest.MockedFunction<PrismaCallFn<Product>>).mockResolvedValue({
      id: 2, name: 'Mouse', price: 340000, qty: 97, createdAt: new Date().toISOString(),
    });
  
    // redis.del mengembalikan angka (jumlah key terhapus) — anggap 1
    redis.del.mockResolvedValue(1);
  
    await service.onModuleInit();
  
    expect(amqpChannel.assertQueue).toHaveBeenCalled();
    expect(amqpChannel.bindQueue).toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { qty: { decrement: 3 } },
    });
    expect(redis.del).toHaveBeenCalledWith('product:2');
    expect(amqpChannel.ack).toHaveBeenCalledWith(fakeMsg);
  });
  
  
  it('onModuleInit → invalid message → nack (requeue=true)', async () => {
    const badMsg: any = { content: Buffer.from('not-json') };
  
    // mute console.error so the SyntaxError from JSON.parse doesn't clutter test output
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
    // mock consume: immediately invoke the callback with an invalid message
    (amqpChannel.consume as any).mockImplementation(async (_q: string, cb: any) => {
      cb(badMsg);
      return { consumerTag: 't' };
    });
  
    await service.onModuleInit();
  
    // your service uses nack(msg, false, true) → requeue = true
    expect(amqpChannel.nack).toHaveBeenCalledWith(badMsg, false, true);
    expect(prisma.product.update).not.toHaveBeenCalled();
  
    errSpy.mockRestore();
  });
  it('onModuleInit → consume callback dapat null msg → early return (no ack/nack)', async () => {
    // Saat consume dipanggil, langsung invoke callback dengan null
    (amqpChannel.consume as jest.MockedFunction<AmqpConsumeFn>)
      .mockImplementation(async (_queue, cb) => {
        cb(null as any); // <- trigger path if (!msg) return
        return { consumerTag: 't' };
      });
  
    await service.onModuleInit();
  
    // Tidak ada efek samping apa pun
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(amqpChannel.ack).not.toHaveBeenCalled();
    expect(amqpChannel.nack).not.toHaveBeenCalled();
  });
  
  it('onModuleInit → invalid numeric payload (NaN) → warn & ack (no update)', async () => {
    // JSON VALID tapi nilai numeriknya tidak valid (akan jadi NaN di parse)
    const badNumericMsg: any = {
      content: Buffer.from(JSON.stringify({
        orderId: 123,
        productId: 'x',   // tidak valid number
        qty: 'y',         // tidak valid number
        totalPrice: 999,
        createdAt: new Date().toISOString(),
      })),
    };
  
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  
    // Saat consume dipanggil, langsung trigger callback dengan payload di atas
    (amqpChannel.consume as any).mockImplementation(async (_q: string, cb: any) => {
      cb(badNumericMsg);
      return { consumerTag: 't' };
    });
  
    await service.onModuleInit();
  
    expect(console.warn).toHaveBeenCalled();               // guard log terpanggil
    expect(amqpChannel.ack).toHaveBeenCalledWith(badNumericMsg);  // ACK (bukan NACK)
    expect(amqpChannel.nack).not.toHaveBeenCalled();       // tidak requeue
    expect(prisma.product.update).not.toHaveBeenCalled();  // tidak ada decrement
    expect(redis.del).not.toHaveBeenCalled();              // tidak ada invalidasi cache
  
    warnSpy.mockRestore();
  });

  it('getAll() → return list dari DB (orderBy id asc)', async () => {
    const now = new Date().toISOString();
    (prisma.product.findMany as any).mockResolvedValue([
      { id: 1, name: 'A', price: 10, qty: 5, createdAt: now },
      { id: 2, name: 'B', price: 20, qty: 3, createdAt: now },
    ]);
  
    const res = await service.getAll();
  
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
    });
    expect(res).toEqual([
      { id: 1, name: 'A', price: 10, qty: 5, createdAt: now },
      { id: 2, name: 'B', price: 20, qty: 3, createdAt: now },
    ]);
  });
  
  
  
});
