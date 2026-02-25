import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Post,
} from '@nestjs/common';
import { RoleCreateDto, RoleUpdateDto } from './dto/role.dto';
import { RbacService } from './rbac.service';

@Controller('rbac')
export class RbacController {
	constructor(private readonly rbacService: RbacService) {}

	@Get('permissions')
	async listPermissions() {
		return this.rbacService.listPermissions();
	}

	@Post('permissions/seed')
	async seedPermissions() {
		return this.rbacService.seedPermissions();
	}

	@Get('roles')
	async listRoles() {
		return this.rbacService.listRoles();
	}

	@Get('roles/:roleId')
	async getRole(@Param('roleId', ParseIntPipe) roleId: number) {
		return this.rbacService.getRole(roleId);
	}

	@Post('roles')
	async createRole(@Body() payload: RoleCreateDto) {
		return this.rbacService.createRole(payload);
	}

	@Patch('roles/:roleId')
	async updateRole(
		@Param('roleId', ParseIntPipe) roleId: number,
		@Body() payload: RoleUpdateDto,
	) {
		return this.rbacService.updateRole(roleId, payload);
	}

	@Delete('roles/:roleId')
	async deleteRole(@Param('roleId', ParseIntPipe) roleId: number) {
		return this.rbacService.deleteRole(roleId);
	}

	@Post('roles/seed')
	async seedRoles() {
		return this.rbacService.seedRoles();
	}
}
