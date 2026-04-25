import {
	Injectable,
	NotFoundException,
	ConflictException,
} from '@nestjs/common';
import { CustomPluginsRepository } from './custom-plugins.repository';
import { GithubService } from './github.service';
import { CreateCustomPluginDto } from './dto/create-custom-plugin.dto';
import { UpdateCustomPluginDto } from './dto/update-custom-plugin.dto';

@Injectable()
export class CustomPluginsService {
	constructor(
		private readonly repo: CustomPluginsRepository,
		private readonly github: GithubService,
	) {}

	findAll() {
		return this.repo.findAll();
	}

	async findById(id: number) {
		const plugin = await this.repo.findById(BigInt(id));
		if (!plugin) throw new NotFoundException(`Custom plugin ${id} not found`);
		return plugin;
	}

	create(dto: CreateCustomPluginDto) {
		return this.repo.create(dto);
	}

	async update(id: number, dto: UpdateCustomPluginDto) {
		await this.findById(id);
		return this.repo.update(BigInt(id), dto);
	}

	async delete(id: number) {
		await this.findById(id);
		const count = await this.repo.countInstallations(BigInt(id));
		if (count > 0) {
			throw new ConflictException(
				`Cannot delete: plugin is installed on ${count} environment(s). Uninstall it first.`,
			);
		}
		return this.repo.delete(BigInt(id));
	}

	async getLatestTag(repoUrl: string): Promise<string | null> {
		return this.github.getLatestTag(repoUrl);
	}
}
