import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';

@Injectable()
export class ServersRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	private encryptServer(data: Partial<CreateServerDto>) {
		const out: Record<string, unknown> = { ...data };
		if (data.ssh_private_key)
			out['ssh_private_key'] = this.enc.encrypt(data.ssh_private_key);
		if (data.ssh_passphrase)
			out['ssh_passphrase'] = this.enc.encrypt(data.ssh_passphrase);
		return out;
	}

	findAll() {
		return this.prisma.server.findMany({
			orderBy: { name: 'asc' },
			select: {
				id: true,
				name: true,
				ip_address: true,
				ssh_port: true,
				ssh_username: true,
				panel_type: true,
				panel_url: true,
				status: true,
				notes: true,
				created_at: true,
				updated_at: true,
			},
		});
	}

	findById(id: bigint) {
		return this.prisma.server.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				ip_address: true,
				ssh_port: true,
				ssh_username: true,
				panel_type: true,
				panel_url: true,
				status: true,
				notes: true,
				created_at: true,
				updated_at: true,
				projects: true,
			},
		});
	}

	findByIdWithKey(id: bigint) {
		return this.prisma.server.findUnique({ where: { id } });
	}

	create(dto: CreateServerDto) {
		const data = this.encryptServer(dto);
		return this.prisma.server.create({ data: data as never });
	}

	update(id: bigint, dto: UpdateServerDto) {
		const data = this.encryptServer(dto);
		return this.prisma.server.update({ where: { id }, data: data as never });
	}

	delete(id: bigint) {
		return this.prisma.server.delete({ where: { id } });
	}
}
