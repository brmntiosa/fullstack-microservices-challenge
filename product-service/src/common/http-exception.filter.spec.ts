import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('formats HttpException to JSON', () => {
    const filter = new HttpExceptionFilter();

    const statusSpy = jest.fn().mockReturnThis();
    const sendSpy = jest.fn();
    const mockReply: any = { status: statusSpy, send: sendSpy };
    const mockReq: any = { url: '/test' };

    const host: any = {
      switchToHttp: () => ({
        getResponse: () => mockReply,
        getRequest: () => mockReq,
      }),
    };

    const err = new HttpException({ message: 'bad' }, HttpStatus.BAD_REQUEST);
    filter.catch(err, host);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: expect.anything(),
        path: '/test',
        timestamp: expect.any(String),
      }),
    );
  });

  it('handles unknown error as 500', () => {
    const filter = new HttpExceptionFilter();
    const statusSpy = jest.fn().mockReturnThis();
    const sendSpy = jest.fn();
    const mockReply: any = { status: statusSpy, send: sendSpy };
    const mockReq: any = { url: '/boom' };
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => mockReply,
        getRequest: () => mockReq,
      }),
    };

    filter.catch(new Error('boom'), host);

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, path: '/boom' }),
    );
  });
});
