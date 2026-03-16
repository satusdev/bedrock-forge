import { Injectable, NotFoundException } from '@nestjs/common';
import { TagsRepository } from './tags.repository';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

@Injectable()
export class TagsService {
	constructor(private readonly repo: TagsRepository) {}

	findAll() {
		return this.repo.findAll();
	}

	async findOne(id: number) {
		const tag = await this.repo.findById(BigInt(id));
		if (!tag) throw new NotFoundException(`Tag ${id} not found`);
		return tag;
	}

	create(dto: CreateTagDto) {
		return this.repo.create(dto);
	}

	async update(id: number, dto: UpdateTagDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), dto);
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}
}
