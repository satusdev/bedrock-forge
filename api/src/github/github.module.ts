import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [GithubController],
	providers: [GithubService],
})
export class GithubModule {}
