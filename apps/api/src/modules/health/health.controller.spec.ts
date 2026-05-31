import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';

describe('HealthController Injection', () => {
	let module: TestingModule;

	beforeEach(async () => {
		const mockPrismaService = {};
		const mockConfigService = {
			get: jest.fn().mockReturnValue('redis://localhost:6379'),
		};
		const mockQueue = {
			getJobCounts: jest.fn().mockResolvedValue({}),
		};

		const queueProviders = Object.values(QUEUES).map((queueName) => ({
			provide: getQueueToken(queueName),
			useValue: mockQueue,
		}));

		const builder = Test.createTestingModule({
			controllers: [HealthController],
			providers: [
				{ provide: PrismaService, useValue: mockPrismaService },
				{ provide: ConfigService, useValue: mockConfigService },
				...queueProviders,
			],
		});

		module = await builder.compile();
	});

	it('should resolve HealthController successfully with all injected queues', () => {
		const controller = module.get<HealthController>(HealthController);
		expect(controller).toBeDefined();
	});
});
