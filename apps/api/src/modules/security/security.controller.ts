import { Throttle } from "@nestjs/throttler";
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
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ROLES } from "@bedrock-forge/shared";
import { SecurityService } from "./security.service";
import { SettingsService } from "../settings/settings.service";
import {
  TriggerServerScanDto,
  TriggerEnvironmentScanDto,
} from "./dto/trigger-scan.dto";
import { ScanQueryDto, SecurityLogsQueryDto } from "./dto/scan-query.dto";
import { UpsertSecurityScheduleDto } from "./dto/security-schedule.dto";
import { UpdateSecuritySettingsDto } from "./dto/update-security-settings.dto";
import { FindingsQueryDto } from "./dto/findings-query.dto";
import { AckFindingDto, RemoveAckDto } from "./dto/ack-finding.dto";
import { GenerateSecurityReportDto } from "./dto/generate-security-report.dto";
import { HardenServerDto, HardenEnvironmentDto } from "./dto/harden-target.dto";
import { UpsertServerAlertSettingDto } from "./dto/server-alert-setting.dto";

@Controller("security")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(ROLES.MANAGER)
export class SecurityController {
  constructor(
    private readonly svc: SecurityService,
    private readonly settings: SettingsService,
  ) {}

  /** GET /security/overview — aggregate across all servers + environments */
  @Get("overview")
  getOverview() {
    return this.svc.getOverview();
  }

  /** GET /security/servers — all servers with latest scan summary */
  @Get("servers")
  getServersList() {
    return this.svc.getServersList();
  }

  /** GET /security/servers/:id/scans — paginated scan history for a server */
  @Get("servers/:id/scans")
  getServerScanHistory(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ScanQueryDto,
  ) {
    return this.svc.getServerScanHistory(
      id,
      query.page ?? 1,
      query.limit ?? 25,
    );
  }

  /** POST /security/servers/:id/scan — trigger one or more scan types on a server */
  @Post("servers/:id/scan")
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  triggerServerScan(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: TriggerServerScanDto,
  ) {
    return this.svc.triggerServerScan(id, dto.types);
  }

  /** GET /security/environments/:id/scans */
  @Get("environments/:id/scans")
  getEnvironmentScanHistory(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ScanQueryDto,
  ) {
    return this.svc.getEnvironmentScanHistory(
      id,
      query.page ?? 1,
      query.limit ?? 25,
    );
  }

  /** POST /security/environments/:id/scan */
  @Post("environments/:id/scan")
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  triggerEnvironmentScan(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: TriggerEnvironmentScanDto,
  ) {
    return this.svc.triggerEnvironmentScan(id, dto.types);
  }

  /** GET /security/scans/:id — full scan result including findings JSON */
  @Get("scans/:id")
  getScan(@Param("id", ParseIntPipe) id: number) {
    return this.svc.getScanById(id);
  }

  /**
   * GET /security/logs — SSH auth event log extracted from SSH_AUDIT findings.
   * Filterable by server_id, date range.
   */
  @Get("logs")
  getSecurityLogs(@Query() query: SecurityLogsQueryDto) {
    return this.svc.getSecurityLogs(
      {
        server_id: query.server_id,
        date_from: query.date_from,
        date_to: query.date_to,
      },
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  // ─── Schedules ───────────────────────────────────────────────────────────────

  /** GET /security/schedules/servers/:id */
  @Get("schedules/servers/:id")
  getServerSchedule(@Param("id", ParseIntPipe) id: number) {
    return this.svc.getServerSchedule(id);
  }

  /** PUT /security/schedules/servers/:id */
  @Put("schedules/servers/:id")
  upsertServerSchedule(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpsertSecurityScheduleDto,
  ) {
    return this.svc.upsertServerSchedule(id, dto);
  }

  /** DELETE /security/schedules/servers/:id */
  @Delete("schedules/servers/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteServerSchedule(@Param("id", ParseIntPipe) id: number) {
    return this.svc.deleteServerSchedule(id);
  }

  /** GET /security/schedules/environments/:id */
  @Get("schedules/environments/:id")
  getEnvironmentSchedule(@Param("id", ParseIntPipe) id: number) {
    return this.svc.getEnvironmentSchedule(id);
  }

  /** PUT /security/schedules/environments/:id */
  @Put("schedules/environments/:id")
  upsertEnvironmentSchedule(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpsertSecurityScheduleDto,
  ) {
    return this.svc.upsertEnvironmentSchedule(id, dto);
  }

  /** DELETE /security/schedules/environments/:id */
  @Delete("schedules/environments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEnvironmentSchedule(@Param("id", ParseIntPipe) id: number) {
    return this.svc.deleteEnvironmentSchedule(id);
  }

  // ─── Server Security Alerts ────────────────────────────────────────────────

  /** GET /security/server-alerts/:serverId */
  @Get("server-alerts/:serverId")
  getServerAlertSetting(@Param("serverId", ParseIntPipe) serverId: number) {
    return this.svc.getServerAlertSetting(serverId);
  }

  /** PUT /security/server-alerts/:serverId */
  @Put("server-alerts/:serverId")
  upsertServerAlertSetting(
    @Param("serverId", ParseIntPipe) serverId: number,
    @Body() dto: UpsertServerAlertSettingDto,
  ) {
    return this.svc.upsertServerAlertSetting(serverId, dto);
  }

  /** POST /security/server-alerts/:serverId/test */
  @Post("server-alerts/:serverId/test")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  testServerAlertSetting(@Param("serverId", ParseIntPipe) serverId: number) {
    return this.svc.testServerAlertSetting(serverId);
  }

  // ─── Security Settings ───────────────────────────────────────────────────────

  /** GET /security/settings — return IP allowlist + global notify threshold */
  @Get("settings")
  getSecuritySettings() {
    return this.svc.getSecuritySettings(this.settings);
  }

  /** PUT /security/settings — update IP allowlist + global notify threshold */
  @Put("settings")
  setSecuritySettings(@Body() dto: UpdateSecuritySettingsDto) {
    return this.svc.setSecuritySettings(
      this.settings,
      dto.ip_allowlist,
      dto.notify_threshold,
    );
  }

  // ─── Findings + Acknowledgements ────────────────────────────────────────────

  /**
   * GET /security/findings — flat, paginated list of findings from latest
   * completed scan per target+type.  Excludes acknowledged by default.
   */
  @Get("findings")
  getAggregatedFindings(@Query() query: FindingsQueryDto) {
    return this.svc.getAggregatedFindings(
      {
        severity: query.severity,
        server_id: query.server_id,
        environment_id: query.environment_id,
        scan_type: query.scan_type,
        acknowledged: query.acknowledged,
      },
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /** POST /security/findings/ack — mark a finding as reviewed/accepted */
  @Post("findings/ack")
  @HttpCode(HttpStatus.NO_CONTENT)
  acknowledgeFinding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AckFindingDto,
  ) {
    return this.svc.acknowledgeFinding(user.id, dto);
  }

  /** DELETE /security/findings/ack — remove an acknowledgement */
  @Delete("findings/ack")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAcknowledgement(@Body() dto: RemoveAckDto) {
    return this.svc.removeAcknowledgement(dto);
  }

  /** POST /security/report — queue a security PDF report */
  @Post("report")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 300_000, limit: 2 } })
  generateReport(@Body() dto: GenerateSecurityReportDto) {
    return this.svc.generateSecurityReport(dto);
  }

  /** GET /security/report/history — last 20 security report jobs */
  @Get("report/history")
  getReportHistory() {
    return this.svc.getSecurityReportHistory();
  }

  // ─── Hardening ───────────────────────────────────────────────────────────────

  /** POST /security/servers/:id/harden — apply server hardening actions */
  @Post("servers/:id/harden")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  hardenServer(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: HardenServerDto,
  ) {
    return this.svc.applyServerHardening(id, dto.actions);
  }

  /** POST /security/environments/:id/harden — apply environment hardening actions */
  @Post("environments/:id/harden")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  hardenEnvironment(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: HardenEnvironmentDto,
  ) {
    return this.svc.applyEnvironmentHardening(id, dto.actions);
  }
}
