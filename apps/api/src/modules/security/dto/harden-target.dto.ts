import { IsArray, IsIn, ArrayMinSize } from "class-validator";
import {
  SERVER_HARDENING_ACTION_TYPES,
  ENVIRONMENT_HARDENING_ACTION_TYPES,
} from "@bedrock-forge/shared";
import type {
  ServerHardeningActionType,
  EnvironmentHardeningActionType,
} from "@bedrock-forge/shared";

export class HardenServerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SERVER_HARDENING_ACTION_TYPES, { each: true })
  actions!: ServerHardeningActionType[];
}

export class HardenEnvironmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ENVIRONMENT_HARDENING_ACTION_TYPES, { each: true })
  actions!: EnvironmentHardeningActionType[];
}
