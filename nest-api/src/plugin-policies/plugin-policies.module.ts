import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PluginPoliciesController } from './plugin-policies.controller';
import { PluginPoliciesService } from './plugin-policies.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [PluginPoliciesController],
	providers: [PluginPoliciesService],
})
export class PluginPoliciesModule {}
