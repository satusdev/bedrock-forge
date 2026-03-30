import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CyberpanelRepository {
	constructor(private readonly prisma: PrismaService) {}

	findServerById(id: bigint) {
		return this.prisma.server.findUnique({
			where: { id },
			select: { id: true, cyberpanel_login: true },
		});
	}

	saveCyberpanelLogin(id: bigint, encryptedLogin: string) {
		return this.prisma.server.update({
			where: { id },
			data: { cyberpanel_login: encryptedLogin },
		});
	}
}
