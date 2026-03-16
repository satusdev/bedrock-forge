import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class ClientsService {
	constructor(private readonly repo: ClientsRepository) {}

	findAll(query: PaginationQuery) {
		return this.repo.findAll(query);
	}

	async findOne(id: number) {
		const client = await this.repo.findById(BigInt(id));
		if (!client) throw new NotFoundException(`Client ${id} not found`);
		return client;
	}

	create(dto: CreateClientDto) {
		return this.repo.create(dto);
	}

	async update(id: number, dto: UpdateClientDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), dto);
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}
}
