import { Controller, Post, Body, UseGuards, Get, Delete, Param } from '@nestjs/common';
import { LLMService, LLMProvider } from './llm.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { ApiKeyScopeGuard } from '../auth/guards/api-key-scope.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { CurrentApiKey } from '../auth/decorators/current-api-key.decorator';
import { ApiKey } from '../entities/api-key.entity';

@Controller('llm')
@UseGuards(CombinedAuthGuard, ApiKeyScopeGuard)
export class LLMController {
  constructor(private llmService: LLMService) { }

  @Post('register')
  @RequireScopes('credentials:write')
  async register(
    @Body()
    body: {
      provider: LLMProvider;
      name?: string;
      apiKey: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    await this.llmService.saveUserCredentials(userId, body);
    return { success: true };
  }

  @Post('update/:id')
  @RequireScopes('credentials:write')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      apiKey?: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    await this.llmService.updateUserCredentials(userId, parseInt(id), body);
    return { success: true };
  }

  @Delete(':id')
  @RequireScopes('credentials:write')
  async delete(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    await this.llmService.deleteCredential(userId, parseInt(id));
    return { success: true };
  }

  @Post('generate')
  @RequireScopes('insights:generate')
  async generate(
    @Body() body: { prompt: string; provider: LLMProvider; credentialId?: number },
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    const text = await this.llmService.generateCompletion(
      userId,
      body.prompt,
      body.provider,
      body.credentialId,
    );
    return { result: text };
  }

  @Get()
  @RequireScopes('credentials:read')
  async getAllCredentials(
    @CurrentUser() user?: User,
    @CurrentApiKey() apiKey?: ApiKey,
  ) {
    const userId = user?.id || apiKey?.createdByUserId;
    if (!userId) throw new Error('User context required');

    const text = await this.llmService.GetLLMCredentials(userId);
    return { result: text };
  }
}
