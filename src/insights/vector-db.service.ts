import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient } from 'chromadb';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    tweetId: string;
    username: string;
    timestamp: string;
    likes: number;
    retweets: number;
    hashtags?: string; // Changed from array to string
    mentions?: string; // Changed from array to string
    [key: string]: any;
  };
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
}

@Injectable()
export class VectorDbService implements OnModuleInit {
  private readonly logger = new Logger(VectorDbService.name);
  private chromaClient: ChromaClient;
  private readonly collectionName = 'tweets_collection';

  constructor(private configService: ConfigService) { }

  async onModuleInit() {
    await this.initializeChroma();
  }

  private async initializeChroma() {
    try {
      const chromaHost = this.configService.get('CHROMA_HOST', 'chromadb');
      const chromaPort = this.configService.get('CHROMA_PORT', 8000);

      this.chromaClient = new ChromaClient({
        path: `http://${chromaHost}:${chromaPort}`,
      });

      this.logger.log(`Connecting to ChromaDB at ${chromaHost}:${chromaPort}`);

      // Create or get collection (uses default all-MiniLM-L6-v2 embeddings)
      try {
        await this.chromaClient.createCollection({
          name: this.collectionName,
          metadata: { description: 'Social media tweets collection' },
        });
        this.logger.log('ChromaDB collection created');
      } catch (error) {
        if (error.message?.includes('already exists')) {
          this.logger.log('ChromaDB collection already exists');
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(`ChromaDB initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add documents to ChromaDB
   */
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
      });

      await collection.upsert({
        ids: documents.map((d) => d.id),
        documents: documents.map((d) => d.content),
        metadatas: documents.map((d) => d.metadata),
      });

      this.logger.log(`Upserted ${documents.length} documents to ChromaDB`);
    } catch (error) {
      this.logger.error(`Failed to add documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for similar documents
   */
  async search(query: string, limit = 10): Promise<VectorSearchResult[]> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
      });

      const results = await collection.query({
        queryTexts: [query],
        nResults: limit,
      });

      return results.ids[0].map((id, idx) => ({
        id,
        content: results.documents[0][idx] as string,
        metadata: results.metadatas[0][idx],
        score: results.distances?.[0]?.[idx] || 0,
      }));
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete documents by IDs
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
      });
      await collection.delete({ ids });
      this.logger.log(`Deleted ${ids.length} documents from ChromaDB`);
    } catch (error) {
      this.logger.error(`Failed to delete documents: ${error.message}`);
      throw error;
    }
  }
}
