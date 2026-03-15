import { IsNotEmpty, IsString } from 'class-validator';

export class SSHKeyUpdateRequestDto {
	@IsString()
	@IsNotEmpty()
	private_key!: string;
}
