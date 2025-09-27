import { Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import amqp, { type Connection, type Channel } from 'amqplib';
import { CLIENTS } from './tokens';

export type Clients = {
  prisma: PrismaClient;
  redis: Redis;
  amqpConn: Connection;
  amqpChannel: Channel;
};

export const ClientsProvider: Provider<Promise<Clients>> = {
  provide: CLIENTS,
  useFactory: async (): Promise<Clients> => {
    const prisma = new PrismaClient();
    const redis  = new Redis(process.env.REDIS_URL!);

    const amqpConn = await amqp.connect(process.env.RABBIT_URL!);
    const amqpChannel = await amqpConn.createChannel();
    await amqpChannel.assertExchange(process.env.RABBIT_EXCHANGE ?? 'orders', 'topic', { durable: true });

    return { prisma, redis, amqpConn, amqpChannel };
  },
};
