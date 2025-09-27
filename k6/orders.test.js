import http from 'k6/http';
import { check } from 'k6';

// === TARGET FINAL: 1000 req/s selama 30 detik ===
export const options = {
  scenarios: {
    warm: {
      executor: 'ramping-arrival-rate',
      startRate: 200, timeUnit: '1s',
      preAllocatedVUs: 300, maxVUs: 3000,
      stages: [
        { target: 400, duration: '10s' },
        { target: 700, duration: '10s' },
        { target: 1000, duration: '10s' },
      ],
      startTime: '0s',
    },
    steady: {
      executor: 'constant-arrival-rate',
      rate: 1000, timeUnit: '1s', duration: '30s',
      preAllocatedVUs: 400, maxVUs: 4000,
      startTime: '30s', // mulai setelah warm selesai
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

// Dipanggil sekali di awal: buat produk + pre-warm cache
export function setup() {
  const PRODUCTS = __ENV.BASE_URL_PRODUCTS;
  const ORDERS   = __ENV.BASE_URL_ORDERS;

  const headers = { headers: { 'Content-Type': 'application/json' } };

  // 1) create product (atau pakai produk existing kalau kamu mau)
  const create = http.post(`${PRODUCTS}/products`, JSON.stringify({
    name: 'LoadTest Item',
    price: 1000,
    qty: 999999,
  }), headers);
  const product = create.json();

  // 2) warm Redis product-service
  http.get(`${PRODUCTS}/products/${product.id}`);

  // 3) warm in-memory cache order-service
  http.post(`${ORDERS}/orders`, JSON.stringify({
    productId: product.id,
    qty: 1,
  }), headers);

  return { productId: product.id };
}

// Entry point tiap iterasi: kirim order
export default function (data) {
  const ORDERS = __ENV.BASE_URL_ORDERS;
  const headers = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post(`${ORDERS}/orders`, JSON.stringify({
    productId: data.productId,
    qty: 1,                // boleh kamu random-kan kalau mau
  }), headers);

  check(res, {
    'status is 201/200': (r) => r.status === 201 || r.status === 200,
  });
}
