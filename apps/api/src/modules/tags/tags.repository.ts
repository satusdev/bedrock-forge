import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

@Injectable()
export class TagsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findAll() {
		return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
	}

	findById(id: bigint) {
		return this.prisma.tag.findUnique({ where: { id } });
	}

	create(dto: CreateTagDto) {
		return this.prisma.tag.create({ data: dto });
	}

	update(id: bigint, dto: UpdateTagDto) {
		return this.prisma.tag.update({ where: { id }, data: dto });
	}

	delete(id: bigint) {
		return this.prisma.tag.delete({ where: { id } });
	}
}
