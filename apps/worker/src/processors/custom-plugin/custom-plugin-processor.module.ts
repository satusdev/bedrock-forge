import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { CustomPluginProcessor } from "./custom-plugin.processor";
import { EncryptionModule } from "../../encryption/encryption.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.CUSTOM_PLUGINS }),
    EncryptionModule,
  ],
  providers: [CustomPluginProcessor],
})
export class CustomPluginProcessorModule {}
