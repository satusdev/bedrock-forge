import { Injectable, NotFoundException } from '@nestjs/common';
import { ServersRepository } from './servers.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';

@Injectable()
export class ServersService {
	constructor(
		private readonly repo: ServersRepository,
		private readonly enc: EncryptionService,
	) {}

	findAll() {
		return this.repo.findAll();
	}

	async findOne(id: number) {
		const server = await this.repo.findById(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);
		return server;
	}

	create(dto: CreateServerDto) {
		return this.repo.create(dto);
	}

	async update(id: number, dto: UpdateServerDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), dto);
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}

	/** Execute a quick `echo ok` to verify SSH connectivity */
	async testConnection(
		id: number,
	): Promise<{ success: boolean; message: string }> {
		const server = await this.repo.findByIdWithKey(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);

		const privateKey = this.enc.decrypt(server.ssh_private_key);
		const passphrase = server.ssh_passphrase
			? this.enc.decrypt(server.ssh_passphrase)
			: undefined;

		const executor = createRemoteExecutor({
			serverId: Number(server.id),
			host: server.ip_address,
			port: server.ssh_port,
			username: server.ssh_username,
			privateKey,
			passphrase,
		});

		try {
			const result = await executor.execute('echo ok');
			return { success: result.exitCode === 0, message: result.stdout.trim() };
		} catch (err: unknown) {
			return {
				success: false,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
