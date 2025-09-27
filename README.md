# Fullstack Microservices Challenge (NestJS + Go)

Monorepo microservices: **product-service (NestJS + Prisma)** & **order-service (Go)**. Event-driven via **RabbitMQ**, cache **Redis**, DB **MySQL**. Termasuk **BFF endpoint**, **validation & error handling**, **Request/Correlation ID**, **Jest 100% coverage**, dan **k6 load test 1000 req/s**.

---
## Screenshots

<details>
  <summary>K6 Result (1000 req/s)</summary>
  <p align="center"><img src="docs/k6.png" alt="K6 Result" width="820"></p>
</details>

<details>
  <summary>BFF: /products/:id-with-orders</summary>
  <p align="center"><img src="docs/bff.png" alt="BFF Combined Endpoint" width="820"></p>
</details>

<details>
  <summary>Create Product</summary>
  <p align="center"><img src="docs/create-product.png" alt="Create Product" width="820"></p>
</details>

<details>
  <summary>Create Order</summary>
  <p align="center"><img src="docs/create-order.png" alt="Create Order" width="820"></p>
</details>

<details>
  <summary>Combined Endpoint (Produk + Orders)</summary>
  <p align="center"><img src="docs/combined-endpoints.png" alt="Combined Endpoints" width="820"></p>
</details>

<details>
  <summary>HTTP Validation & Error Handling (NestJS)</summary>
  <p align="center"><img src="docs/validation-error-handling.png" alt="HTTP Validation & Error Handling" width="820"></p>
</details>

<details>
  <summary>order-service (Go): Strict JSON + Error Envelope + Recover</summary>
  <p align="center"><img src="docs/go-error-envelope.png" alt="Go Error Envelope & Recover" width="820"></p>
</details>

<details>
  <summary>Request ID / Correlation ID</summary>
  <p align="center"><img src="docs/request-id-correlation-id.png" alt="Request ID / Correlation ID" width="820"></p>
</details>


---

## Arsitektur Singkat

* **product-service (NestJS)**

  * CRUD Product (MySQL via Prisma).
  * Redis cache untuk detail (`GET /products/:id`) + invalidasi saat update/delete/event.
  * **Consume** event `order.created` → decrement stok + invalidate cache.
  * **BFF endpoint**: `GET /products/:id-with-orders` (gabung product + orders dari order-service).
  * **Validation** (`class-validator`) + **Global HTTP Error Filter** (uniform error JSON).
  * **RequestIdInterceptor** → set/forward `X-Request-ID` (trace end-to-end).

* **order-service (Go)**

  * `POST /orders` → validasi product (call product-service), insert DB, publish `order.created`, invalidate list cache.
  * `GET /orders/product/:id` → cached Redis (TTL 60s).
  * **Middleware**: `WithRequestID` (inject/forward header), `WithRecover` (panic-safe JSON error).
  * **Optimisasi**: prepared statement insert, HTTP client reuse, in-memory price cache (SWR) untuk harga product.

* **Infra (Docker Compose)**

  * MySQL + Redis + RabbitMQ.
  * MySQL **dev tuning** (buffer pool, flush log, dll) supaya stabil saat load test.

**Event flow**

1. `POST /orders` (Go) validasi product ke product-service.
2. Insert order → publish `order.created`.
3. product-service consume event → decrement stok + invalidate cache.

---

## Cara Menjalankan (Docker Compose)

```bash
cd infra
docker compose build
docker compose up -d
docker compose ps
```

**Endpoint default**

* product-service: [http://localhost:3000](http://localhost:3000)
* order-service: [http://localhost:4000](http://localhost:4000)
* RabbitMQ UI: [http://localhost:15672](http://localhost:15672)  (guest / guest)
* MySQL: localhost:3306  (user: app / pass: app, db: appdb)
* Redis: localhost:6379

> Compose sudah menyetel environment antar-service (lihat `infra/docker-compose.yml`).

---

## Health Check

* **product-service (NestJS)**: `GET /products` (atau endpoint apa saja yang sederhana).
* **order-service (Go)**: `GET /health` → `"order-service up"`.

```bash
curl -s http://localhost:4000/health
```

---

## Environment

**product-service/.env.example**

```ini
DATABASE_URL=mysql://app:app@mysql:3306/appdb
REDIS_URL=redis://redis:6379
RABBIT_URL=amqp://guest:guest@rabbitmq:5672
ORDERS_BASE=http://order-service:4000
AMQP_EXCHANGE=orders
```

**order-service/.env.example**

```ini
MYSQL_DSN=app:app@tcp(mysql:3306)/appdb?parseTime=true&loc=UTC&timeout=5s&interpolateParams=true
REDIS_URL=redis://redis:6379
RABBIT_URL=amqp://guest:guest@rabbitmq:5672
PRODUCT_BASE_URL=http://product-service:3000
AMQP_EXCHANGE=orders
AMQP_ROUTING_KEY_ORDER_CREATED=order.created
AMQP_QUEUE_ORDER_CREATED=order-service__logger
AMQP_CONSUMER_TAG=order-service-logger
```

---

## Contoh API (CMD • PowerShell • Bash)

### PowerShell

```powershell
# Create product
curl -s -H "Content-Type: application/json" `
     -d '{"name":"BFF Test","price":1000,"qty":50}' `
     http://localhost:3000/products

# Create order (ganti 26 dengan ID produk)
curl -s -H "Content-Type: application/json" `
     -d '{"productId":26,"qty":2}' `
     http://localhost:4000/orders

# BFF combined
curl -s "http://localhost:3000/products/26-with-orders"
```

### CMD (Windows)

```bat
:: Create product
curl -s -H "Content-Type: application/json" -d "{\"name\":\"BFF Test\",\"price\":1000,\"qty\":50}" http://localhost:3000/products

:: Create order
curl -s -H "Content-Type: application/json" -d "{\"productId\":26,\"qty\":2}" http://localhost:4000/orders

:: BFF combined
curl -s "http://localhost:3000/products/26-with-orders"
```

### Linux/Mac (bash/zsh)

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"name":"BFF Test","price":1000,"qty":50}' \
  http://localhost:3000/products

curl -s -H "Content-Type: application/json" \
  -d '{"productId":26,"qty":2}' \
  http://localhost:4000/orders

curl -s "http://localhost:3000/products/26-with-orders"
```

---

## Request ID / Correlation ID

* **order-service (Go)**: `WithRequestID` meneruskan header `X-Request-ID` dari client, jika tidak ada, generate baru. Response **selalu** mengembalikan header `X-Request-Id`.
* **product-service (NestJS)**: `RequestIdInterceptor` menyetel/forward `X-Request-ID` ke downstream (termasuk call BFF → order-service). Memudahkan trace APM/log end-to-end.

**Contoh pakai header custom**

```bash
curl -i -H "X-Request-ID: demo-123" \
     -H "Content-Type: application/json" \
     -d '{"productId":26,"qty":1}' \
     http://localhost:4000/orders
# → Response akan mengandung: X-Request-Id: demo-123
```

---

## Testing — product-service (Jest)

```bash
cd product-service
npm i
npm test
npm run test:cov
```

* **Coverage 100%** (service, controller, BFF controller, HTTP exception filter).
* Mencakup: cache miss/hit, invalidasi cache, konsumsi event `order.created`, controller param transform, BFF combine & fallback.

## Testing — order-service (Go)

```bash
cd order-service
go mod download
go test ./...
```

* Ada unit test untuk GET (cache miss → hit).
* Behavior kritikal lain tervalidasi saat k6 (black-box).

---

## K6 Load Test (1000 req/s)

Script: `k6/orders.test.js` (skenario **ramping/steady arrival rate** → ±1000 iters/s, threshold `p(95)<300ms`, `http_req_failed<1%`).

### Docker (PowerShell, jalankan dari folder `k6/`)

```powershell
docker run --rm -i --network infra_default `
  -e BASE_URL_ORDERS=http://order-service:4000 `
  -e BASE_URL_PRODUCTS=http://product-service:3000 `
  -v "$PWD:/scripts" grafana/k6:latest `
  run --summary-export /scripts/k6-results-docker.json /scripts/orders.test.js
```

### Docker (CMD)

```bat
docker run --rm -i --network infra_default ^
  -e BASE_URL_ORDERS=http://order-service:4000 ^
  -e BASE_URL_PRODUCTS=http://product-service:3000 ^
  -v "%CD%:/scripts" grafana/k6:latest ^
  run --summary-export /scripts/k6-results-docker.json /scripts/orders.test.js
```

**Output yang diharapkan**

* Rate ~**1000 iters/s** stabil (lihat bagian `steady` / `ramp`).
* `http_req_duration p(95) < 300ms`.
* `http_req_failed < 1%`.
  Export hasil: `k6/k6-results-docker.json` + sertakan screenshot `docs/K6.png`.

---


## Troubleshooting

1. **Pengiriman JSON di Windows (CMD/PowerShell)**

   * **CMD** butuh escape kutip:
     `curl -H "Content-Type: application/json" -d "{\"name\":\"A\",\"price\":1000,\"qty\":1}" http://localhost:3000/products`
   * **PowerShell**:
     `curl -H "Content-Type: application/json" -d '{"name":"A","price":1000,"qty":1}' http://localhost:3000/products`

2. **k6 tidak menemukan skrip / “function 'default' not found”**

   * Jalankan perintah dari folder `k6/`.
   * Pastikan volume mount benar:
     PowerShell: `-v "$PWD:/scripts"` • CMD: `-v "%CD%:/scripts"`.
   * File yang dijalankan harus `orders.test.js` dan memiliki `export default function () { ... }`.

3. **RabbitMQ belum siap / connection refused**

   * Cek log: `docker compose logs rabbitmq`.
   * Restart service yang bergantung:
     `docker compose restart product-service order-service`.

4. **MySQL lambat saat uji beban**

   * Compose sudah menyetel opsi dev-friendly (`innodb_flush_log_at_trx_commit=2`, `sync_binlog=0`, `innodb_buffer_pool_size=1G`, `max_connections=500`).
     Sesuaikan nilainya dengan kapasitas mesin bila perlu.

5. **Perilaku cache setelah stok berubah (MISS → HIT)**

   * Saat `order.created` diproses, cache detail produk dihapus agar data akurat.
     Request pertama setelah itu **MISS** (mengisi ulang cache), berikutnya **HIT**.

6. **Verifikasi Request ID / Correlation ID**

   * Kirim header kustom dan pastikan ikut dikembalikan:

     ```
     curl -i -H "X-Request-ID: demo-123" -H "Content-Type: application/json" \
          -d '{"productId":26,"qty":1}' http://localhost:4000/orders
     ```

     Respon harus memuat `X-Request-Id: demo-123`.

---

## Struktur Proyek

```
.
├── infra/
│   └── docker-compose.yml
├── product-service/        # NestJS + Prisma + Redis + AMQP
│   ├── src/
│   │   ├── common/         # RequestIdInterceptor, HttpExceptionFilter (+ tests)
│   │   └── products/       # service, controller, BFF (+ tests)
│   └── ...
├── order-service/          # Go HTTP + Redis + AMQP
│   ├── cmd/server/main.go
│   └── internal/
│       ├── http/           # handlers + middleware (requestID, recover)
│       └── repo/           # prepared insert, queries
├── k6/
│   ├── orders.test.js
│   └── k6-results-docker.json
└── README.md
```

---

## Lisensi

Bebas digunakan untuk keperluan test/assessment. Untuk produksi, sesuaikan konfigurasi keamanan, observability, dan environment.
