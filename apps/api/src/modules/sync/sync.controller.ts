import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES } from "@bedrock-forge/shared";
import { SyncService } from "./sync.service";
import { SyncCloneDto, SyncPushDto } from "./dto/sync.dto";

@Controller("sync")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(ROLES.MANAGER)
export class SyncController {
  constructor(private readonly svc: SyncService) {}

  @Post("clone")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  enqueueClone(@Body() dto: SyncCloneDto) {
    return this.svc.enqueueClone(dto);
  }

  @Post("push")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  enqueuePush(@Body() dto: SyncPushDto) {
    return this.svc.enqueuePush(dto);
  }

  @Post("execution/:id/cancel")
  @HttpCode(HttpStatus.OK)
  cancelJobExecution(@Param("id", ParseIntPipe) id: number) {
    return this.svc.cancelJobExecution(id);
  }
}
