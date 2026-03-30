import { Global, Module } from '@nestjs/common';
import { SshKeyService } from './ssh-key.service';

@Global()
@Module({ providers: [SshKeyService], exports: [SshKeyService] })
export class SshKeyModule {}
