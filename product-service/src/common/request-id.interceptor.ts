import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    let rid: string | undefined = req.headers['x-request-id'] as string | undefined;
    if (!rid) rid = randomUUID(); // ← pakai built-in Node.js

    (req as any).requestId = rid;

    if (typeof res.header === 'function') {
      res.header('X-Request-ID', rid);
    } else if (typeof res.setHeader === 'function') {
      res.setHeader('X-Request-ID', rid);
    }
    return next.handle();
  }
}
