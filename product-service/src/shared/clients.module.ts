import { Global, Module } from '@nestjs/common';
import { ClientsProvider } from './clients.provider';

@Global()
@Module({
  providers: [ClientsProvider],
  exports:   [ClientsProvider],
})
export class ClientsModule {}
