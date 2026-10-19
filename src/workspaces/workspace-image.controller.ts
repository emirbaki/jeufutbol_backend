import {
  Controller,
  Delete,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../entities/workspace.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKeyScope } from '../auth/api-key-scopes.enum';
import { UserRole } from '../auth/user-role.enum';
import { UploadService } from '../upload/upload.service';
import { MANAGE_WORKSPACES, WorkspaceAccessService } from './workspace-access.service';
import { imageFileName, imageMulterOptions, validateImageUpload } from '../upload/image-upload';

@Controller('workspaces/:id/image')
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
@RequireScopes(ApiKeyScope.ADMIN)
export class WorkspaceImageController {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly uploadService: UploadService,
    private readonly accessService: WorkspaceAccessService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('image', imageMulterOptions))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ): Promise<Workspace> {
    const workspace = await this.findManageable(id, user, apiKey);
    validateImageUpload(file);
    const oldUrl = workspace.imageUrl;
    workspace.imageUrl = await this.uploadService.saveFile(file.buffer, imageFileName(file));
    const saved = await this.workspaceRepository.save(workspace);
    if (oldUrl) await this.uploadService.deleteFileByUrl(oldUrl);
    return saved;
  }

  @Delete()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ): Promise<Workspace> {
    const workspace = await this.findManageable(id, user, apiKey);
    const oldUrl = workspace.imageUrl;
    workspace.imageUrl = null;
    const saved = await this.workspaceRepository.save(workspace);
    if (oldUrl) await this.uploadService.deleteFileByUrl(oldUrl);
    return saved;
  }

  /** An admin, or an API key that reaches all branches (the guard already checked its admin scope). */
  private async findManageable(id: string, user?: User, apiKey?: ApiKey): Promise<Workspace> {
    const allowed = user
      ? user.role === UserRole.ADMIN
      : (await this.accessService.accessFor(undefined, apiKey)) === 'all';
    if (!allowed) throw new ForbiddenException(MANAGE_WORKSPACES);
    const tenantId = user?.tenantId || apiKey?.tenantId;
    if (!tenantId) throw new ForbiddenException('Tenant context required.');
    const workspace = await this.workspaceRepository.findOne({ where: { id, tenantId } });
    if (!workspace) throw new NotFoundException(`Workspace "${id}" not found.`);
    return workspace;
  }
}
