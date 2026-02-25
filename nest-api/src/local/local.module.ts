import { Module } from '@nestjs/common';
import { LocalController } from './local.controller';
import { LocalService } from './local.service';

@Module({
	controllers: [LocalController],
	providers: [LocalService],
})
export class LocalModule {}
