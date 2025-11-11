import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmCredential } from '../entities/llm-credential.entity';
import { EncryptionUtil } from '../utils/encryption.util';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama, type ChatOllamaInput } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type LLMProvider = 'openai' | 'gemini' | 'ollama' | 'claude';
export enum LLMTypes {
  OPENAI = 'openai',
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
  CLAUDE = 'claude',
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private cache = new Map<string, BaseChatModel>(); // key: userId_provider

  constructor(
    @InjectRepository(LlmCredential)
    private readonly credentialRepo: Repository<LlmCredential>,
  ) {}

  async GetLLMCredentials(userId: string): Promise<LlmCredential[]> {
    const credentials = await this.credentialRepo.find({
      where: {
        userId,
      },
    });
    return credentials;
  }

  async saveUserCredentials(
    userId: string,
    data: {
      provider: LLMProvider;
      apiKey: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
  ) {
    const encryptedKey = EncryptionUtil.encrypt(data.apiKey);

    await this.credentialRepo.upsert(
      {
        userId,
        provider: data.provider,
        apiKey: encryptedKey,
        baseUrl: data.baseUrl,
        modelName: data.modelName,
        temperature: data.temperature ?? 0.7,
      },
      ['userId'],
    );

    this.logger.log(`Saved credentials for user ${userId}`);
  }

  async getModel(
    userId: string,
    provider: LLMProvider,
  ): Promise<BaseChatModel> {
    const cacheKey = `${userId}_${provider}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const cred = await this.credentialRepo.findOne({
      where: { userId, provider },
    });
    if (!cred) throw new Error(`No credentials found for ${provider}`);

    const apiKey = EncryptionUtil.decrypt(cred.apiKey);

    let model: BaseChatModel;

    switch (provider) {
      case 'openai':
        model = new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: cred.modelName || 'gpt-4o',
          temperature: cred.temperature,
        });
        break;
      case 'gemini':
        model = new ChatGoogleGenerativeAI({
          apiKey,
          model: cred.modelName || 'gemini-pro',
          temperature: cred.temperature,
        });
        break;
      case 'ollama': {
        const config: ChatOllamaInput = {
          baseUrl: cred.baseUrl ?? 'https://ollama.com',
          model: cred.modelName ?? 'gpt-oss:120b-cloud',
          temperature: cred.temperature ?? 0.7,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        model = new ChatOllama(config);
        break;
      }
      default:
        throw new Error('Unknown provider');
    }

    this.cache.set(cacheKey, model);
    return model;
  }

  async generateCompletion(
    userId: string,
    prompt: string,
    provider: LLMProvider,
  ): Promise<string> {
    const model = await this.getModel(userId, provider);
    const response = await model.invoke(prompt);
    return response.content.toString();
  }
}
