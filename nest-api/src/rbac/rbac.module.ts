import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

@Module({
	controllers: [RbacController],
	providers: [RbacService],
})
export class RbacModule {}
