import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LLMService, LLMProvider } from './llm.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/entities/user.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LLMController {
  constructor(private llmService: LLMService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      provider: LLMProvider;
      apiKey: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
    @CurrentUser() user: User,
  ) {
    const userId = user.id;
    await this.llmService.saveUserCredentials(userId, body);
    return { success: true };
  }

  @Post('generate')
  async generate(
    @Body() body: { prompt: string; provider: LLMProvider },
    @CurrentUser() user: User,
  ) {
    const userId = user.id;
    const text = await this.llmService.generateCompletion(
      userId,
      body.prompt,
      body.provider,
    );
    return { result: text };
  }
}
