import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  AuthenticatedUser,
  CurrentUser,
} from "../../common/decorators/current-user.decorator";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get()
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") query = "",
    @Query("limit") limit?: string,
  ) {
    return this.svc.search({
      query,
      limit: limit ? Number(limit) : undefined,
      roles: user.roles,
    });
  }
}
