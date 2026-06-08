import { IsIn, IsString, IsUrl } from "class-validator";

export class TestWebhookDto {
  @IsIn(["slack", "discord", "google_chat"], {
    message: "Type must be slack, discord, or google_chat",
  })
  type!: "slack" | "discord" | "google_chat";

  @IsString()
  @IsUrl({}, { message: "Url must be a valid URL" })
  url!: string;
}
