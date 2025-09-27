# Fullstack Developer Test – Microservices (NestJS + Go)

Monorepo microservices dengan **product-service (NestJS + Prisma)** dan **order-service (Go)**. Komponen pendukung: **MySQL**, **Redis**, **RabbitMQ**, dan **k6** untuk load test. Mendemonstrasikan event-driven (`order.created`), cache Redis, clean layering, dan bonus BFF, validation/error-handling, serta request-id/correlation id.

## Arsitektur Singkat
- **product-service (NestJS)**
  - Tabel: `products (id, name, price, qty, createdAt)`
  - Endpoint:
    - `POST /products` – create product
    - `GET /products/:id` – get (cached Redis, TTL)
    - `PUT /products/:id`, `DELETE /products/:id` – update/delete (invalidate cache)
    - **BFF**: `GET /products/:id-with-orders` – gabungkan detail product + orders (fan-out ke order-service)
  - Event:
    - Publish `product.created` (opsional)
    - **Listen `order.created`** → decrement `qty` + invalidate cache, **warm cache** pasca-decrement
  - Testing: Jest unit tests **100% coverage** (service, controller, BFF, exception filter)
  - Bonus: **ValidationPipe + HttpExceptionFilter** (global), **RequestIdInterceptor** (X-Request-ID)

- **order-service (Go)**
  - Tabel: `orders (id, productId, qty, totalPrice, status, createdAt)`
  - Endpoint:
    - `POST /orders` – validasi product via product-service, insert DB, publish `order.created`, invalidate cache orders
    - `GET /orders/product/:productId` – list (cached Redis)
  - Event:
    - Publish `order.created` (saat create)
    - **Listen & log** `order.created`
  - Perf: koneksi DB di-tune, HTTP client reusable, in-memory price cache (SWR) untuk validasi product
  - Bonus: **WithRecover** + **WithRequestID** middleware (X-Request-ID end-to-end)

- **Infra (docker-compose)**
  - `mysql`, `redis`, `rabbitmq`, `product-service`, `order-service`
  - MySQL dev tuning: `innodb_flush_log_at_trx_commit=2`, `sync_binlog=0`, `innodb_buffer_pool_size=1G`, `max_connections=500`

## Cara Menjalankan (Docker Compose)
```bash
cd infra
docker compose build
docker compose up -d
docker compose ps
# Pastikan service up & healthy, MySQL/Redis/RabbitMQ/product-service/order-service
# asdsad
```dsadsa
dsa
