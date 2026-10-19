import { Controller, Delete, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UploadService } from '../upload/upload.service';
import { imageFileName, imageMulterOptions, validateImageUpload } from '../upload/image-upload';

/** The signed-in user's own profile image. */
@Controller('users/me/avatar')
@UseGuards(JwtAuthGuard)
export class UserAvatarController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', imageMulterOptions))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ): Promise<{ avatarUrl: string | null }> {
    validateImageUpload(file);
    const avatarUrl = await this.uploadService.saveFile(file.buffer, imageFileName(file, 'avatar'));
    await this.replace(user.id, avatarUrl);
    return { avatarUrl };
  }

  @Delete()
  async remove(@CurrentUser() user: User): Promise<{ avatarUrl: string | null }> {
    await this.replace(user.id, null);
    return { avatarUrl: null };
  }

  private async replace(userId: string, avatarUrl: string | null): Promise<void> {
    const current = await this.userRepository.findOne({ where: { id: userId } });
    await this.userRepository.update({ id: userId }, { avatarUrl });
    if (current?.avatarUrl) await this.uploadService.deleteFileByUrl(current.avatarUrl);
  }
}
