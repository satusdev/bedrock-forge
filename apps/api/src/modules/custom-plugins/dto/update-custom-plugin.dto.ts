import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomPluginDto } from './create-custom-plugin.dto';

export class UpdateCustomPluginDto extends PartialType(CreateCustomPluginDto) {}
