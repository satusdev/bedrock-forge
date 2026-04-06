import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	ParseIntPipe,
	HttpCode,
	HttpStatus,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ROLES } from '@bedrock-forge/shared';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('roles')
	getRoles() {
		return this.usersService.findAllRoles();
	}

	@Get()
	findAll(@Query() query: PaginationQueryDto) {
		return this.usersService.findAll(
			query.page ?? 1,
			query.limit ?? 20,
			query.search,
		);
	}

	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.usersService.findById(id);
	}

	@Post()
	@Throttle({ default: { ttl: 60_000, limit: 20 } })
	create(@Body() dto: CreateUserDto) {
		return this.usersService.create(dto);
	}

	@Put(':id')
	update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: UpdateUserDto,
		@CurrentUser() currentUser: { id: number },
	) {
		return this.usersService.update(id, dto, currentUser.id);
	}

	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(
		@Param('id', ParseIntPipe) id: number,
		@CurrentUser() currentUser: { id: number },
	) {
		return this.usersService.remove(id, currentUser.id);
	}
}
