import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient } from 'chromadb';
import { env, pipeline } from '@xenova/transformers';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    tweetId: string;
    username: string;
    timestamp: string;
    likes: number;
    retweets: number;
    hashtags?: string;
    mentions?: string;
    [key: string]: any;
  };
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
}

/**
 * Embedding generator using Xenova/transformers
 * Optimized for batch processing
 */
class EmbeddingGenerator {
  private pipeline: any;
  private readonly modelName = 'Xenova/multilingual-e5-small';
  private readonly logger = new Logger(EmbeddingGenerator.name);

  getModelName(): string {
    return this.modelName;
  }

  async initialize(): Promise<void> {
    if (!this.pipeline) {
      this.logger.log(`Loading embedding model: ${this.modelName}`);
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Embedding model loaded successfully');
    }
  }

  /**
   * Generate embeddings for texts in optimized batches
   */
  async generate(texts: string[]): Promise<number[][]> {
    await this.initialize();

    const embeddings: number[][] = [];
    const BATCH_SIZE = 32; // Process 32 texts at a time for better throughput

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchEmbeddings = await Promise.all(
        batch.map(async (text) => {
          const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
          return Array.from(output.data) as number[];
        })
      );

      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Generate embeddings for documents (tweets) with "passage:" prefix
   * This is recommended for multilingual-e5 models
   */
  async generateForDocuments(texts: string[]): Promise<number[][]> {
    const prefixedTexts = texts.map(t => `passage: ${t}`);
    return this.generate(prefixedTexts);
  }

  /**
   * Generate embeddings for search queries with "query:" prefix
   * This is recommended for multilingual-e5 models
   */
  async generateForQuery(query: string): Promise<number[][]> {
    return this.generate([`query: ${query}`]);
  }
}

@Injectable()
export class VectorDbService implements OnModuleInit {
  private readonly logger = new Logger(VectorDbService.name);
  private chromaClient: ChromaClient;
  private readonly collectionName = 'tweets_collection';
  private embeddingGenerator: EmbeddingGenerator;

  constructor(private configService: ConfigService) {
    if (process.env.XENOVA_CACHE_DIR) {
      this.logger.log(`Setting Transformer Cache Dir to: ${process.env.XENOVA_CACHE_DIR}`);
      env.cacheDir = process.env.XENOVA_CACHE_DIR;
    } else {
      this.logger.warn('XENOVA_CACHE_DIR not set! Using default node_modules (Risk of data loss)');
    }

    // Force CPU usage for ONNX Runtime
    env.backends.onnx.wasm.numThreads = 4; // Use more threads for faster processing
    env.backends.onnx.wasm.simd = true;
    process.env.ONNXRUNTIME_DEVICE = 'cpu';

    this.logger.log('Configured transformers to use CPU for embeddings');
    this.embeddingGenerator = new EmbeddingGenerator();
  }

  //DUMMY EMBEDDER
  private get chromaEmbedder() {
    return {
      generate: (texts: string[]) => this.embeddingGenerator.generate(texts),
    };
  }

  async onModuleInit() {
    await this.initializeChroma();
    // Pre-warm the embedding model during startup
    await this.embeddingGenerator.initialize();
  }

  private async initializeChroma() {
    try {
      const chromaHost = this.configService.get('CHROMA_HOST', 'chromadb');
      const chromaPort = this.configService.get('CHROMA_PORT', 8000);

      this.chromaClient = new ChromaClient({
        host: chromaHost,
        port: chromaPort,
        ssl: false,
      });

      this.logger.log(`Connecting to ChromaDB at ${chromaHost}:${chromaPort}`);

      // Check if collection exists using try-catch
      let collectionExists = false;
      let collection;
      try {
        collection = await this.chromaClient.getCollection({
          name: this.collectionName,
          embeddingFunction: this.chromaEmbedder,
        });
        collectionExists = true;
      } catch (e) {
        // Collection doesn't exist
        collectionExists = false;
      }

      if (collectionExists && collection) {
        const metadata = collection.metadata as any;
        if (metadata?.model !== this.embeddingGenerator.getModelName()) {
          this.logger.warn(`Collection model mismatch (Found: ${metadata?.model}, Expected: ${this.embeddingGenerator.getModelName()}). Resetting collection...`);
          await this.chromaClient.deleteCollection({ name: this.collectionName });
          await this.createCollection();
        } else {
          this.logger.log('ChromaDB collection loaded successfully');
        }
      } else {
        await this.createCollection();
      }
    } catch (error) {
      this.logger.error(`ChromaDB initialization failed: ${error.message}`);
      throw error;
    }
  }

  private async createCollection(): Promise<void> {
    await this.chromaClient.createCollection({
      name: this.collectionName,
      metadata: {
        description: 'Social media tweets collection',
        model: this.embeddingGenerator.getModelName(),
      },
      embeddingFunction: this.chromaEmbedder,
    });
    this.logger.log('ChromaDB collection created');
  }

  /**
   * Add documents to ChromaDB with optimized batch processing
   */
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;

    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: this.chromaEmbedder,
      });

      // Generate embeddings with progress logging
      this.logger.log(`Generating embeddings for ${documents.length} documents...`);
      const startTime = Date.now();

      const embeddings = await this.embeddingGenerator.generateForDocuments(
        documents.map((d) => d.content)
      );

      const embeddingTime = Date.now() - startTime;
      this.logger.log(`Embeddings generated in ${(embeddingTime / 1000).toFixed(1)}s`);

      // Upsert to ChromaDB
      await collection.upsert({
        ids: documents.map((d) => d.id),
        documents: documents.map((d) => d.content),
        metadatas: documents.map((d) => d.metadata),
        embeddings: embeddings,
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
  async search(query: string, limit = 10, offset = 0): Promise<VectorSearchResult[]> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: this.chromaEmbedder,
      });

      // Generate query embedding with "query:" prefix for better e5 performance
      const queryEmbeddings = await this.embeddingGenerator.generateForQuery(query);

      // ChromaDB doesn't support offset natively, so we fetch (limit + offset) and slice
      const results = await collection.query({
        queryEmbeddings: queryEmbeddings,
        nResults: limit + offset,
      });

      // Handle empty results
      if (!results.ids[0] || results.ids[0].length === 0) {
        return [];
      }

      // Map all results first
      const allResults = results.ids[0].map((id, idx) => ({
        id,
        content: results.documents[0][idx] as string,
        metadata: results.metadatas[0][idx],
        score: results.distances?.[0]?.[idx] || 0,
      }));

      // Return slice for pagination
      return allResults.slice(offset, offset + limit);
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
        embeddingFunction: this.chromaEmbedder,
      });
      await collection.delete({ ids });
      this.logger.log(`Deleted ${ids.length} documents from ChromaDB`);
    } catch (error) {
      this.logger.error(`Failed to delete documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset the collection (delete and recreate)
   * Used when changing embedding models
   */
  async resetCollection(): Promise<void> {
    try {
      this.logger.warn('Resetting ChromaDB collection...');
      try {
        await this.chromaClient.deleteCollection({ name: this.collectionName });
        this.logger.log('Deleted existing collection');
      } catch (e) {
        // Ignore if collection doesn't exist
      }

      await this.createCollection();
      this.logger.log('Collection reset successfully');
    } catch (error) {
      this.logger.error(`Failed to reset collection: ${error.message}`);
      throw error;
    }
  }
}
