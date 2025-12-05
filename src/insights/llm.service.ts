import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmCredential } from '../entities/llm-credential.entity';
import { EncryptionUtil } from '../utils/encryption.util';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama, type ChatOllamaInput } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

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
  ) { }

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
      name?: string;
      apiKey: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
  ) {
    const encryptedKey = EncryptionUtil.encrypt(data.apiKey);

    await this.credentialRepo.save({
      userId,
      provider: data.provider,
      name: data.name,
      apiKey: encryptedKey,
      baseUrl: data.baseUrl,
      modelName: data.modelName,
      temperature: data.temperature ?? 0.7,
    });

    this.logger.log(`Saved credentials for user ${userId}`);
  }

  async updateUserCredentials(
    userId: string,
    credentialId: number,
    data: {
      name?: string;
      apiKey?: string;
      baseUrl?: string;
      modelName?: string;
      temperature?: number;
    },
  ) {
    const credential = await this.credentialRepo.findOne({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      throw new Error('Credential not found');
    }

    if (data.name) credential.name = data.name;
    if (data.apiKey) credential.apiKey = EncryptionUtil.encrypt(data.apiKey);
    if (data.baseUrl !== undefined) credential.baseUrl = data.baseUrl;
    if (data.modelName !== undefined) credential.modelName = data.modelName;
    if (data.temperature !== undefined) credential.temperature = data.temperature;

    await this.credentialRepo.save(credential);
    this.logger.log(`Updated credential ${credentialId} for user ${userId}`);
  }

  async deleteCredential(userId: string, id: number) {
    await this.credentialRepo.delete({ id, userId });
    this.logger.log(`Deleted credential ${id} for user ${userId}`);
  }

  async getModel(
    userId: string,
    provider: LLMProvider,
    credentialId?: number,
  ): Promise<BaseChatModel> {
    const cacheKey = `${userId}_${provider}_${credentialId || 'default'}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    let cred: LlmCredential | null = null;

    if (credentialId) {
      cred = await this.credentialRepo.findOne({
        where: { id: credentialId, userId },
      });
    } else {
      cred = await this.credentialRepo.findOne({
        where: { userId, provider },
        order: { id: 'DESC' },
      });
    }

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
    credentialId?: number,
  ): Promise<string> {
    const model = await this.getModel(userId, provider, credentialId);
    const response = await model.invoke([new HumanMessage(prompt)]);
    return response.content.toString();
  }
}
