import { Module } from '@nestjs/common';
import { WebsocketCompatService } from './websocket-compat.service';

@Module({
	providers: [WebsocketCompatService],
	exports: [WebsocketCompatService],
})
export class WebsocketModule {}
