import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';

import { ProductsBffController } from './products.bff.controller';
import { ProductsService } from './products.service';

type Product = {
  id: number;
  name: string;
  price: number;
  qty: number;
  createdAt: string;
};

type ProductsServiceMock = {
  getById: jest.MockedFunction<(id: number) => Promise<Product>>;
};

type HttpServiceMock = {
  get: jest.MockedFunction<(url: string, config?: any) => any>;
};

describe('ProductsBffController', () => {
  let ctrl: ProductsBffController;
  let svc: ProductsServiceMock;
  let http: HttpServiceMock;

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.ORDERS_BASE = 'http://orders.local';

    // service mock
    svc = {
      getById: jest.fn() as jest.MockedFunction<(id: number) => Promise<Product>>,
    };

    http = {
      get: jest.fn((_url: string, _config?: any) =>
        of({
          status: 200,
          data: [
            {
              id: 1,
              productId: 20,
              qty: 2,
              totalPrice: 2000,
              status: 'CREATED',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      ) as jest.MockedFunction<(url: string, config?: any) => any>,
    };

    const mod = await Test.createTestingModule({
      controllers: [ProductsBffController],
      providers: [
        { provide: ProductsService, useValue: svc },
        { provide: HttpService, useValue: http },
      ],
    }).compile();

    ctrl = mod.get(ProductsBffController);
  });

  it('returns combined product + orders', async () => {
    const product: Product = {
      id: 20,
      name: 'BFF Test',
      price: 1000,
      qty: 48,
      createdAt: new Date().toISOString(),
    };
    svc.getById.mockResolvedValue(product);

    const res = await (ctrl as any).getWithOrders(20);

    expect(svc.getById).toHaveBeenCalledWith(20);
    expect(http.get).toHaveBeenCalledWith(
      `${process.env.ORDERS_BASE}/orders/product/20`,
      expect.objectContaining({ timeout: 2500 }),
    );
    expect(res).toMatchObject({
      product: { id: 20 },
      orders: expect.any(Array),
    });
  });

  it('handles orders API non-200 by returning empty orders', async () => {
    const product: Product = {
      id: 21,
      name: 'X',
      price: 500,
      qty: 10,
      createdAt: new Date().toISOString(),
    };
    svc.getById.mockResolvedValue(product);

    http.get.mockImplementationOnce((_url: string, _config?: any) =>
      of({ status: 500, data: {} }),
    );

    const res = await (ctrl as any).getWithOrders(21);

    expect(svc.getById).toHaveBeenCalledWith(21);
    expect(res).toMatchObject({
      product: { id: 21 },
      orders: [],
    });
  });
});
