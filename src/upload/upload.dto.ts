import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;
}
