import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JobsGateway } from "./jobs.gateway";
import { JobExecutionsModule } from "../modules/job-executions/job-executions.module";
import { EnvironmentsModule } from "../modules/environments/environments.module";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("jwt.secret"),
      }),
    }),
    JobExecutionsModule,
    EnvironmentsModule,
  ],
  providers: [JobsGateway],
  exports: [JobsGateway],
})
export class GatewaysModule {}
