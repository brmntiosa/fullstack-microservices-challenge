import { describe, it, expect, jest, beforeEach } from '@jest/globals';
// src/products/products.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BadRequestException } from '@nestjs/common';

type Product = {
  id: number;
  name: string;
  price: number;
  qty: number;
  createdAt: string;
};

// Definisikan tipe fungsi untuk tiap method service
type CreateFn = (dto: any) => Promise<Product>;
type GetByIdFn = (id: number) => Promise<Product>;
type GetAllFn = () => Promise<Product[]>;
type UpdateFn = (id: number, dto: any) => Promise<Product>;
type RemoveFn = (id: number) => Promise<{ id: number }>;

describe('ProductsController', () => {
  let controller: ProductsController;

  // Mock service dengan tipe yang stabil menggunakan MockedFunction
  const svc = {
    create:  jest.fn() as jest.MockedFunction<CreateFn>,
    getById: jest.fn() as jest.MockedFunction<GetByIdFn>,
    getAll:  jest.fn() as jest.MockedFunction<GetAllFn>,
    update:  jest.fn() as jest.MockedFunction<UpdateFn>,
    remove:  jest.fn() as jest.MockedFunction<RemoveFn>,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers:   [{ provide: ProductsService, useValue: svc }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    jest.clearAllMocks();
  });

  it('create', async () => {
    const dto = { name: 'A', price: 10, qty: 5 };
    const now = new Date().toISOString();

    svc.create.mockResolvedValue({ id: 1, name: 'A', price: 10, qty: 5, createdAt: now });

    // Unit test tidak menjalankan pipeline (ParseIntPipe, ValidationPipe, dll)
    await expect((controller as any).create(dto)).resolves.toEqual({
      id: 1, name: 'A', price: 10, qty: 5, createdAt: now,
    });
    expect(svc.create).toHaveBeenCalledWith(dto);
  });

  it('getById (param string → service number)', async () => {
    const now = new Date().toISOString();
    svc.getById.mockResolvedValue({ id: 1, name: 'A', price: 10, qty: 5, createdAt: now });

    // Kirim '1' (string) untuk mensimulasikan @Param('id') id: string
    await expect((controller as any).getById('1')).resolves.toMatchObject({
      id: 1,
      createdAt: expect.any(String),
    });

    // Pastikan controller mengonversi '1' → 1 saat memanggil service
    expect(svc.getById).toHaveBeenCalledWith(1);
  });

  it('getAll', async () => {
    const now = new Date().toISOString();
    svc.getAll.mockResolvedValue([
      { id: 1, name: 'A', price: 10, qty: 5, createdAt: now },
      { id: 2, name: 'B', price: 20, qty: 3, createdAt: now },
    ]);

    await expect((controller as any).getAll()).resolves.toEqual([
      { id: 1, name: 'A', price: 10, qty: 5, createdAt: now },
      { id: 2, name: 'B', price: 20, qty: 3, createdAt: now },
    ]);
    expect(svc.getAll).toHaveBeenCalledTimes(1);
  });

  it('update (param string → service number)', async () => {
    const now = new Date().toISOString();
    const dto = { name: 'B', price: 20 };
    svc.update.mockResolvedValue({ id: 1, name: 'B', price: 20, qty: 5, createdAt: now });

    await expect((controller as any).update('1', dto)).resolves.toMatchObject({
      id: 1,
      name: 'B',
      price: 20,
      createdAt: expect.any(String),
    });

    expect(svc.update).toHaveBeenCalledWith(1, dto);
  });

  it('remove (param string → service number)', async () => {
    svc.remove.mockResolvedValue({ id: 1 });

    await expect((controller as any).remove('1')).resolves.toEqual({ id: 1 });
    expect(svc.remove).toHaveBeenCalledWith(1);
  });

  it('update menerima number langsung', async () => {
    const now = new Date().toISOString();
    svc.update.mockResolvedValue({ id: 7, name: 'Z', price: 123, qty: 1, createdAt: now });
    await expect((controller as any).update(7, { name: 'Z', price: 123 }))
      .resolves.toMatchObject({ id: 7 });
    expect(svc.update).toHaveBeenCalledWith(7, { name: 'Z', price: 123 });
  });
  
  it('remove menerima number langsung', async () => {
    svc.remove.mockResolvedValue({ id: 7 });
    await expect((controller as any).remove(7)).resolves.toEqual({ id: 7 });
    expect(svc.remove).toHaveBeenCalledWith(7);
  });
  
  it('getById menerima number langsung (tanpa konversi)', async () => {
    const now = new Date().toISOString();
    svc.getById.mockResolvedValue({ id: 2, name: 'N', price: 1, qty: 1, createdAt: now });
  
    await expect((controller as any).getById(2)).resolves.toMatchObject({ id: 2 });
    expect(svc.getById).toHaveBeenCalledWith(2);
  });
  
  it('getById lempar BadRequest kalau id invalid', () => {
    expect(() => (controller as any).getById('abc')).toThrow(BadRequestException);
  });
  
  it('update lempar BadRequest kalau id invalid', () => {
    expect(() => (controller as any).update('NaN', { name: 'X' })).toThrow(BadRequestException);
  });
  
  it('remove lempar BadRequest kalau id invalid', () => {
    expect(() => (controller as any).remove('oops')).toThrow(BadRequestException);
  });
});
