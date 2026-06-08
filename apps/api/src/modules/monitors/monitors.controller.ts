import {
  Controller,
  Get,
  Post,
  Put,
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
import { MonitorsService } from "./monitors.service";
import { CreateMonitorDto, UpdateMonitorDto } from "./dto/monitor.dto";
import {
  MAX_TIMESERIES_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "../../common/pagination";

@Controller("monitors")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(ROLES.MANAGER)
export class MonitorsController {
  constructor(private readonly svc: MonitorsService) {}

  @Get()
  findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
  ) {
    return this.svc.findAll({
      page: normalizePage(page),
      limit: normalizePageSize(limit),
      search: search || undefined,
    });
  }

  @Get(":id") findOne(@Param("id", ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(":id/logs") findLogs(
    @Param("id", ParseIntPipe) id: number,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.svc.findLogs(id, {
      page: normalizePage(page),
      limit: normalizePageSize(limit, 50),
    });
  }

  @Get(":id/results") findResults(
    @Param("id", ParseIntPipe) id: number,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.svc.findResults(id, {
      page: normalizePage(page),
      limit: normalizePageSize(limit, 100, MAX_TIMESERIES_PAGE_SIZE),
    });
  }

  @Post() create(@Body() dto: CreateMonitorDto) {
    return this.svc.create(dto);
  }

  @Put(":id") update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMonitorDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Put(":id/activate") activate(@Param("id", ParseIntPipe) id: number) {
    return this.svc.toggle(id, true);
  }

  @Put(":id/deactivate") deactivate(@Param("id", ParseIntPipe) id: number) {
    return this.svc.toggle(id, false);
  }
}
