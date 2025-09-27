import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import amqp, { type Connection, type Channel } from 'amqplib';

export type Clients = {
  prisma: PrismaClient;
  redis: Redis;
  amqpConn: Connection;
  amqpChannel: Channel;
};

export async function createClients(): Promise<Clients> {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL!);

  // boleh juga tanpa anotasi agar inference mengunci tipe yang benar:
  const amqpConn: Connection = await amqp.connect(process.env.RABBIT_URL!);
  const amqpChannel: Channel = await amqpConn.createChannel();

  await amqpChannel.assertExchange('orders', 'topic', { durable: true });

  return { prisma, redis, amqpConn, amqpChannel };
}
