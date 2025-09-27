import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestIdInterceptor } from './common/request-id.interceptor'; 

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  }));

  app.useGlobalInterceptors(new RequestIdInterceptor());

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
}
bootstrap();
