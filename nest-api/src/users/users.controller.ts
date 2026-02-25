import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Put,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	UserCreateDto,
	UserResetPasswordDto,
	UserUpdateDto,
} from './dto/user-create.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('me/permissions')
	async getCurrentUserPermissions(
		@Headers('authorization') authorizationHeader?: string,
	) {
		return this.usersService.getCurrentUserPermissions(authorizationHeader);
	}

	@Get()
	async listUsers(@Query('search') search?: string) {
		return this.usersService.listUsers(search);
	}

	@Get('/')
	async listUsersSlash(@Query('search') search?: string) {
		return this.usersService.listUsers(search);
	}

	@Get(':userId')
	async getUser(@Param('userId', ParseIntPipe) userId: number) {
		return this.usersService.getUser(userId);
	}

	@Post()
	async createUser(@Body() payload: UserCreateDto) {
		return this.usersService.createUser(payload);
	}

	@Patch(':userId')
	async updateUser(
		@Param('userId', ParseIntPipe) userId: number,
		@Body() payload: UserUpdateDto,
	) {
		return this.usersService.updateUser(userId, payload);
	}

	@Put(':userId')
	async updateUserLegacy(
		@Param('userId', ParseIntPipe) userId: number,
		@Body() payload: UserUpdateDto,
	) {
		return this.usersService.updateUser(userId, payload);
	}

	@Delete(':userId')
	async deleteUser(
		@Param('userId', ParseIntPipe) userId: number,
		@Headers('authorization') authorizationHeader?: string,
	) {
		return this.usersService.deleteUser(userId, authorizationHeader);
	}

	@Post(':userId/reset-password')
	async resetUserPassword(
		@Param('userId', ParseIntPipe) userId: number,
		@Body() payload: UserResetPasswordDto,
	) {
		return this.usersService.resetPassword(userId, payload);
	}
}
