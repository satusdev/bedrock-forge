import { IsString, MinLength } from 'class-validator';

/**
 * SetGdriveDto
 *
 * Accepts the rclone OAuth token JSON produced by `rclone authorize "drive"`.
 * Must contain at least `access_token` and `refresh_token`.
 * Example: {"access_token":"ya29.xxx","token_type":"Bearer","refresh_token":"1//xxx","expiry":"..."}
 */
export class SetGdriveDto {
	/**
	 * The JSON token string printed by `rclone authorize "drive"`.
	 * Must contain: access_token, refresh_token.
	 */
	@IsString()
	@MinLength(20)
	token!: string;
}
