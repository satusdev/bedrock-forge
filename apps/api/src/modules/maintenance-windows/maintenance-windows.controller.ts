import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES } from "@bedrock-forge/shared";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { MaintenanceWindowsService } from "./maintenance-windows.service";
import { CreateMaintenanceWindowDto, QueryMaintenanceWindowsDto } from "./dto/maintenance-window.dto";

@Controller("maintenance-windows")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MaintenanceWindowsController {
  constructor(private readonly svc: MaintenanceWindowsService) {}

  @Get()
  findAll(@Query() query: QueryMaintenanceWindowsDto) {
    return this.svc.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles(ROLES.ADMIN, ROLES.MANAGER)
  create(
    @Body() dto: CreateMaintenanceWindowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(dto, user.id);
  }

  @Delete(":id")
  @Roles(ROLES.ADMIN, ROLES.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }
}
