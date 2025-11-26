import { LLMProvider } from '../llm.service';

// Job input DTOs
export interface GenerateInsightsJobData {
    userId: string;
    tenantId: string;
    topic?: string;
    llmProvider?: LLMProvider;
    useVectorSearch?: boolean;
}

export interface GeneratePostJobData {
    insights: string[];
    platform: 'twitter' | 'instagram' | 'facebook' | 'linkedin';
    tone?: 'professional' | 'casual' | 'humorous' | 'informative' | 'engaging';
    includeHashtags?: boolean;
    includeEmojis?: boolean;
    userId?: string;
    llmProvider?: LLMProvider;
}

export interface IndexTweetsJobData {
    profileId: string;
}

// Job result DTOs
export interface GenerateInsightsJobResult {
    insights: Array<{
        id: string;
        type: string;
        title: string;
        description: string;
        relevanceScore: number;
        createdAt: Date;
    }>;
}

export interface GeneratePostJobResult {
    content: string;
    hashtags: string[];
    platform: string;
    estimatedReach: string;
}

export interface IndexTweetsJobResult {
    indexedCount: number;
}

export interface FetchProfileTweetsJobData {
    profileId: string;
    count?: number;
}

export interface FetchProfileTweetsJobResult {
    tweetsCount: number;
    profileId: string;
}

export interface RefreshAllProfilesJobData {
    force?: boolean;
}

export interface RefreshAllProfilesJobResult {
    enqueuedCount: number;
}

// Job status enum
export enum JobStatusEnum {
    WAITING = 'waiting',
    ACTIVE = 'active',
    COMPLETED = 'completed',
    FAILED = 'failed',
    DELAYED = 'delayed',
}

// Job status response (for GraphQL)
export interface JobStatusDto {
    id: string;
    status: JobStatusEnum;
    progress: number; // 0-100
    result?: any;
    error?: string;
    createdAt: Date;
    finishedAt?: Date;
}
