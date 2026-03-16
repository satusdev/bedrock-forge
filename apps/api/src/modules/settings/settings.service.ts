import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
	constructor(private readonly prisma: PrismaService) {}

	async getAll() {
		const settings = await this.prisma.appSetting.findMany({
			orderBy: { key: 'asc' },
		});
		return Object.fromEntries(settings.map(s => [s.key, s.value]));
	}

	async get(key: string) {
		const s = await this.prisma.appSetting.findUnique({ where: { key } });
		return s ? { key: s.key, value: s.value } : null;
	}

	async set(key: string, value: string) {
		return this.prisma.appSetting.upsert({
			where: { key },
			update: { value },
			create: { key, value },
		});
	}

	async delete(key: string) {
		return this.prisma.appSetting.delete({ where: { key } });
	}
}
