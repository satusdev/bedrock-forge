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
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES } from "@bedrock-forge/shared";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { ThemeScansService } from "./theme-scans.service";
import { ThemeManageDto } from "./dto/theme-manage.dto";

@Controller("theme-scans")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(ROLES.MANAGER)
export class ThemeScansController {
  constructor(private readonly svc: ThemeScansService) {}

  @Get("environment/:envId")
  findByEnv(
    @Param("envId", ParseIntPipe) envId: number,
    @Query() q: PaginationQueryDto,
  ) {
    return this.svc.findByEnvironment(envId, q);
  }

  @Post("environment/:envId/scan")
  @HttpCode(HttpStatus.ACCEPTED)
  enqueueScan(@Param("envId", ParseIntPipe) envId: number) {
    return this.svc.enqueueScan(envId);
  }

  /** Install a theme from the WordPress.org repository */
  @Post("environment/:envId/themes")
  @HttpCode(HttpStatus.ACCEPTED)
  installTheme(
    @Param("envId", ParseIntPipe) envId: number,
    @Body() dto: ThemeManageDto,
  ) {
    return this.svc.enqueueThemeManage(envId, "install", dto.slug);
  }

  /** Delete a theme */
  @Delete("environment/:envId/themes/:slug")
  @HttpCode(HttpStatus.ACCEPTED)
  deleteTheme(
    @Param("envId", ParseIntPipe) envId: number,
    @Param("slug") slug: string,
  ) {
    return this.svc.enqueueThemeManage(envId, "delete", slug);
  }

  /** Update a specific theme */
  @Put("environment/:envId/themes/:slug")
  @HttpCode(HttpStatus.ACCEPTED)
  updateTheme(
    @Param("envId", ParseIntPipe) envId: number,
    @Param("slug") slug: string,
  ) {
    return this.svc.enqueueThemeManage(envId, "update", slug);
  }

  /** Update all themes */
  @Put("environment/:envId/themes")
  @HttpCode(HttpStatus.ACCEPTED)
  updateAllThemes(@Param("envId", ParseIntPipe) envId: number) {
    return this.svc.enqueueThemeManage(envId, "update-all");
  }

  /** Activate a specific theme */
  @Post("environment/:envId/themes/:slug/activate")
  @HttpCode(HttpStatus.ACCEPTED)
  activateTheme(
    @Param("envId", ParseIntPipe) envId: number,
    @Param("slug") slug: string,
  ) {
    return this.svc.enqueueThemeManage(envId, "activate", slug);
  }

  /** Get job execution status for polling theme job results */
  @Get("execution/:execId")
  getExecution(@Param("execId", ParseIntPipe) execId: number) {
    return this.svc.findJobExecution(execId);
  }
}
