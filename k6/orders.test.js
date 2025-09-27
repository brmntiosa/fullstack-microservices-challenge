import http from 'k6/http';
import { check } from 'k6';

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
      startTime: '30s', 
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

export function setup() {
  const PRODUCTS = __ENV.BASE_URL_PRODUCTS;
  const ORDERS   = __ENV.BASE_URL_ORDERS;
  const headers = { headers: { 'Content-Type': 'application/json' } };
  const create = http.post(`${PRODUCTS}/products`, JSON.stringify({
    name: 'LoadTest Item',
    price: 1000,
    qty: 999999,
  }), headers);
  const product = create.json();

  http.get(`${PRODUCTS}/products/${product.id}`);
  http.post(`${ORDERS}/orders`, JSON.stringify({
    productId: product.id,
    qty: 1,
  }), headers);

  return { productId: product.id };
}

export default function (data) {
  const ORDERS = __ENV.BASE_URL_ORDERS;
  const headers = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post(`${ORDERS}/orders`, JSON.stringify({
    productId: data.productId,
    qty: 1,                
  }), headers);

  check(res, {
    'status is 201/200': (r) => r.status === 201 || r.status === 200,
  });
}
