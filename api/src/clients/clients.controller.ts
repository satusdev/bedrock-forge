import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ClientCreateDto } from './dto/client-create.dto';
import { ClientUpdateDto } from './dto/client-update.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
	constructor(private readonly clientsService: ClientsService) {}

	@Get()
	async getAllClients(@Query() query: GetClientsQueryDto) {
		return this.clientsService.getAllClients(query);
	}

	@Get('/')
	async getAllClientsSlash(@Query() query: GetClientsQueryDto) {
		return this.clientsService.getAllClients(query);
	}

	@Get('users/:userId/preferences')
	async getUserPreferences(@Param('userId') userId: string) {
		return this.clientsService.getUserPreferences(userId);
	}

	@Put('users/:userId/preferences')
	async updateUserPreferences(
		@Param('userId') userId: string,
		@Body() payload: Record<string, unknown>,
	) {
		return this.clientsService.updateUserPreferences(userId, payload);
	}

	@Get(':clientId')
	async getClient(@Param('clientId', ParseIntPipe) clientId: number) {
		return this.clientsService.getClient(clientId);
	}

	@Post()
	async createClient(@Body() payload: ClientCreateDto) {
		return this.clientsService.createClient(payload);
	}

	@Post('/')
	async createClientSlash(@Body() payload: ClientCreateDto) {
		return this.clientsService.createClient(payload);
	}

	@Put(':clientId')
	async updateClient(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Body() payload: ClientUpdateDto,
	) {
		return this.clientsService.updateClient(clientId, payload);
	}

	@Delete(':clientId')
	async deleteClient(@Param('clientId', ParseIntPipe) clientId: number) {
		return this.clientsService.deleteClient(clientId);
	}

	@Get(':clientId/projects')
	async getClientProjects(@Param('clientId', ParseIntPipe) clientId: number) {
		return this.clientsService.getClientProjects(clientId);
	}

	@Get(':clientId/invoices')
	async getClientInvoices(@Param('clientId', ParseIntPipe) clientId: number) {
		return this.clientsService.getClientInvoices(clientId);
	}

	@Post(':clientId/assign-project/:projectId')
	async assignProjectToClient(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Param('projectId', ParseIntPipe) projectId: number,
	) {
		return this.clientsService.assignProjectToClient(clientId, projectId);
	}

	@Delete(':clientId/unassign-project/:projectId')
	async unassignProjectFromClient(
		@Param('clientId', ParseIntPipe) clientId: number,
		@Param('projectId', ParseIntPipe) projectId: number,
	) {
		return this.clientsService.unassignProjectFromClient(clientId, projectId);
	}
}
