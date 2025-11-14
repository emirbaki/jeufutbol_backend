# JeuHub Backend - Social Media Management API

A robust NestJS-based GraphQL API for managing multi-platform social media content with AI-powered insights, OAuth authentication, and real-time monitoring capabilities.

## 🚀 Overview

The JeuHub backend provides a comprehensive API for social media management, featuring GraphQL endpoints, REST APIs for file uploads and OAuth, AI-powered content generation, and automated tweet monitoring from X (Twitter).

## ✨ Key Features

### 🔐 Authentication & Authorization
- **JWT-based Authentication**: Secure token-based auth with Passport.js
- **OAuth2 Integration**: Connect X, Instagram, Facebook, and TikTok accounts
- **Encrypted Token Storage**: AES-256-GCM encryption for sensitive credentials
- **Role-based Access Control**: User-specific data isolation

### 📝 Content Management
- **Multi-Platform Publishing**: Post to X, Instagram, Facebook, TikTok, YouTube
- **Draft/Schedule/Publish Workflow**: Full post lifecycle management
- **Media Upload & Management**: Image and video handling with validation
- **Platform-Specific Content**: Customize content per platform
- **Bulk Operations**: Publish to multiple platforms simultaneously

### 🤖 AI-Powered Features
- **LangChain Integration**: Advanced AI agents with tool usage
- **Multiple LLM Support**: OpenAI, Google Gemini, Ollama, Claude
- **AI Insights Generation**: Automated trend analysis and content suggestions
- **Post Template Generation**: AI-created posts based on insights
- **Vector Search**: ChromaDB integration for semantic search
- **Scheduled Insights**: Automated daily insight generation

### 📊 Monitoring & Analytics
- **X Profile Monitoring**: Track and store tweets from specified profiles
- **Engagement Metrics**: Likes, retweets, replies, views tracking
- **Tweet Analysis**: Hashtag extraction, mention tracking, media processing
- **Profile Statistics**: Aggregated metrics and top hashtags
- **Automated Refresh**: Hourly tweet updates via cron jobs

### 🗄️ Data Management
- **PostgreSQL Database**: Robust relational data storage
- **TypeORM**: Type-safe database operations
- **Vector Database**: ChromaDB for AI embeddings
- **File Storage**: Local/CDN file management
- **Data Encryption**: At-rest encryption for sensitive data

## 🏗️ Architecture

### Tech Stack
- **Framework**: NestJS 10+ (TypeScript)
- **API**: GraphQL (Apollo Server) + REST endpoints
- **Database**: PostgreSQL with TypeORM
- **Authentication**: Passport.js + JWT
- **AI/ML**: LangChain, OpenAI, Google Gemini
- **Vector DB**: ChromaDB
- **Task Scheduling**: @nestjs/schedule
- **File Upload**: Multer

### Project Structure

```
src/
├── app.module.ts                   # Root module
├── main.ts                         # Application entry point
│
├── auth/                           # Authentication module
│   ├── auth.service.ts            # Auth logic (login, register, JWT)
│   ├── auth.resolver.ts           # GraphQL auth mutations/queries
│   ├── strategies/                # Passport strategies
│   ├── guards/                    # Auth guards (JWT, GQL)
│   └── decorators/                # Custom decorators (@CurrentUser)
│
├── entities/                       # TypeORM entities
│   ├── user.entity.ts             # User accounts
│   ├── post.entity.ts             # User posts
│   ├── published-post.entity.ts   # Published post records
│   ├── social-account.entity.ts   # Connected social accounts
│   ├── credential.entity.ts       # OAuth credentials
│   ├── monitored-profile.entity.ts # X profiles being monitored
│   ├── tweet.entity.ts            # Stored tweets
│   ├── insight.entity.ts          # AI-generated insights
│   └── llm-credential.entity.ts   # LLM provider credentials
│
├── credentials/                    # Credential management
│   ├── credential.service.ts      # Encryption, token refresh
│   ├── credential.controller.ts   # OAuth flow handlers
│   └── oauth.service.ts           # Platform-specific OAuth
│
├── post/                          # Post management
│   ├── post.service.ts            # Post CRUD operations
│   ├── post.resolver.ts           # GraphQL post endpoints
│   ├── gateways/                  # Platform posting gateways
│   │   ├── x.gateway.ts           # X (Twitter) posting
│   │   ├── instagram.gateway.ts   # Instagram posting
│   │   ├── facebook.gateway.ts    # Facebook posting
│   │   └── tiktok.gateway.ts      # TikTok posting
│   └── post-gateway.factory.ts    # Gateway factory pattern
│
├── monitoring/                     # X profile monitoring
│   ├── monitoring.service.ts      # Profile & tweet management
│   ├── monitoring.resolver.ts     # GraphQL monitoring endpoints
│   └── monitoring-scheduler.service.ts # Automated refresh
│
├── tweets/                        # Tweet storage & retrieval
│   └── tweets.service.ts          # Rettiwt-API integration
│
├── insights/                      # AI insights module
│   ├── ai-insights.service.ts     # Core insight generation
│   ├── ai-insights.resolver.ts    # GraphQL insights endpoints
│   ├── llm.service.ts             # LLM provider management
│   ├── llm.controller.ts          # LLM REST endpoints
│   ├── vector-db.service.ts       # ChromaDB integration
│   ├── tools/                     # LangChain tools
│   │   └── post-generator.tool.ts # AI tools for agents
│   └── ai-insights-scheduler.service.ts # Daily insights
│
├── upload/                        # File upload management
│   ├── upload.service.ts          # File storage & CDN
│   ├── upload.controller.ts       # Upload endpoints
│   └── pipes/                     # Validation pipes
│
├── social-accounts/               # Social account management
│   ├── social-accounts.service.ts
│   ├── social-accounts.resolver.ts
│   └── social-accounts.controller.ts
│
├── utils/                         # Utility functions
│   └── encryption.util.ts         # AES-256-GCM encryption
│
└── graphql/                       # GraphQL types
    ├── inputs/                    # Input types
    └── types/                     # Object types
```

## 🔑 Key Modules

### Authentication Module
Handles user registration, login, and JWT token management.

```typescript
// Register new user
mutation Register {
  register(
    email: "user@example.com"
    password: "password123"
    firstName: "John"
    lastName: "Doe"
  ) {
    user { id email }
    accessToken
  }
}

// Login
mutation Login {
  login(email: "user@example.com", password: "password123") {
    user { id email }
    accessToken
  }
}
```

### Post Management
Complete post lifecycle from creation to multi-platform publishing.

**Features:**
- Draft, Schedule, Publish workflow
- Multi-platform support (X, Instagram, Facebook, TikTok)
- Media upload and attachment
- Platform-specific content customization
- Automatic credential management
- Error handling and retry logic

**Publishing Flow:**
1. Create post (draft)
2. Upload media (optional)
3. Select target platforms
4. Publish to all platforms simultaneously
5. Store published post records with URLs

### OAuth Credential Management
Secure storage and management of OAuth tokens.

**Security Features:**
- AES-256-GCM encryption for tokens
- Automatic token refresh
- Platform-specific OAuth flows
- Secure callback handling
- Token expiry tracking

**Supported Platforms:**
- X (Twitter) - OAuth 2.0
- Instagram - Facebook Graph API
- Facebook - Graph API
- TikTok - TikTok API v2

### AI Insights Engine
LangChain-powered AI system for content intelligence.

**Capabilities:**
- Trend analysis from monitored tweets
- Content suggestions based on engagement patterns
- Optimal posting time recommendations
- Audience interest identification
- Multi-LLM support (OpenAI, Gemini, Ollama)

**AI Agent Tools:**
- **PostGeneratorTool**: Creates platform-optimized posts
- **TrendAnalysisTool**: Analyzes trending topics
- **ContentSuggestionTool**: Generates content ideas

**Vector Search:**
- ChromaDB integration for semantic search
- Tweet embedding and indexing
- Relevance-based retrieval

### Monitoring System
Automated X (Twitter) profile monitoring with Rettiwt-API.

**Features:**
- Add/remove profiles to monitor
- Fetch recent tweets (up to 1000)
- Store tweets with full metadata
- Extract hashtags, mentions, media URLs
- Engagement metrics tracking
- Hourly automated refresh
- Profile statistics aggregation

## 🌐 API Endpoints

### GraphQL API

**Authentication**
```graphql
mutation Login($email: String!, $password: String!)
mutation Register($email: String!, $password: String!, $firstName: String!, $lastName: String!)
query Me
```

**Posts**
```graphql
mutation CreatePost($input: CreatePostInput!)
mutation PublishPost($postId: String!)
mutation UpdatePost($postId: String!, $input: UpdatePostInput!)
mutation DeletePost($postId: String!)
query GetUserPosts($limit: Int)
query GetPost($postId: String!)
```

**Monitoring**
```graphql
mutation AddMonitoredProfile($xUsername: String!)
mutation RemoveMonitoredProfile($profileId: String!)
mutation RefreshProfileTweets($profileId: String!)
query GetMonitoredProfiles
query GetProfileTweets($profileId: String!, $limit: Int)
query GetProfileStats($profileId: String!)
```

**Insights**
```graphql
mutation GenerateAIInsights($topic: String, $llmProvider: String)
mutation GeneratePostTemplate($insights: [String!]!, $platform: String!, $tone: String)
mutation IndexTweetsToVector($profileId: String!)
query GetInsights($limit: Float)
query AnalyzeTrends($topic: String, $timeRange: String)
```

**Social Accounts**
```graphql
query GetConnectedAccounts
mutation DisconnectAccount($accountId: String!)
```

### REST API

**File Upload**
```
POST /api/upload/single - Upload single file
POST /api/upload/multiple - Upload multiple files
```

**OAuth**
```
POST /api/credentials/oauth/authorize-url - Get OAuth URL
GET /api/credentials/oauth/callback - OAuth callback handler
GET /api/credentials - Get user credentials
POST /api/credentials/:id/test - Test credential
DELETE /api/credentials/:id - Delete credential
```

**LLM Management**
```
POST /api/llm/register - Register LLM credentials
POST /api/llm/generate - Generate completion
GET /api/llm - Get LLM credentials
```

## 🔧 Configuration

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=jeuhub

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your-encryption-key-here

# API Configuration
API_URL=https://jeufutbol.com.tr/api
PORT=3000
NODE_ENV=development

# OAuth - X (Twitter)
X_CLIENT_ID=your-twitter-client-id
X_CLIENT_SECRET=your-twitter-client-secret
X_API_KEY=your-twitter-api-key
X_API_SECRET=your-twitter-api-secret

# OAuth - Facebook
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# OAuth - Instagram
INSTAGRAM_APP_ID=your-instagram-app-id
INSTAGRAM_APP_SECRET=your-instagram-app-secret

# OAuth - TikTok
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# File Upload
UPLOAD_DIR=/var/www/uploads
PUBLIC_BASE_URL=https://cdn.example.com/uploads

# Rettiwt API (for tweet monitoring)
RETTIWT_API_KEY=your-rettiwt-api-key

# ChromaDB (Vector Database)
CHROMA_URL=http://localhost:8000

# Frontend
FRONTEND_URL=https://jeufutbol.com.tr
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- ChromaDB (optional, for vector search)
- OAuth credentials for social platforms

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migration:run

# Start development server
npm run start:dev

# Access GraphQL Playground
# Navigate to http://localhost:3000/graphql
```

### Build for Production

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

## 📊 Database Schema

### Core Entities

**users**
- id, email, passwordHash, firstName, lastName, isActive

**posts**
- id, userId, content, mediaUrls, status, targetPlatforms, scheduledFor

**published_posts**
- id, postId, platform, platformPostId, platformPostUrl, publishMetadata

**credentials**
- id, userId, platform, type, encryptedData, accessToken, refreshToken, tokenExpiresAt

**monitored_profiles**
- id, userId, xUsername, xUserId, displayName, followerCount, lastFetchedAt

**tweets**
- id, monitoredProfileId, tweetId, content, likes, retweets, replies, views, hashtags

**insights**
- id, userId, type, title, description, relevanceScore, metadata, isRead

**llm_credentials**
- id, userId, provider, apiKey, baseUrl, modelName, temperature

## 🔒 Security Features

### Encryption
- **AES-256-GCM**: All OAuth tokens and sensitive credentials
- **JWT Tokens**: Secure authentication with configurable expiry
- **Password Hashing**: bcrypt with salt rounds
- **Environment Variables**: Sensitive config isolated from code

### Input Validation
- **Class Validator**: DTO validation with decorators
- **File Validation**: Size, type, and malware checks
- **GraphQL Validation**: Input type validation
- **SQL Injection Protection**: TypeORM parameterized queries

### Access Control
- **JWT Guards**: Protect all authenticated endpoints
- **User Isolation**: Query filtering by userId
- **OAuth State Validation**: CSRF protection
- **Rate Limiting**: Prevent abuse (recommended to add)

## 🤖 AI Integration

### LLM Support
```typescript
// Configure LLM credentials
POST /api/llm/register
{
  "provider": "openai",
  "apiKey": "sk-...",
  "modelName": "gpt-4",
  "temperature": 0.7
}

// Generate AI insights
mutation GenerateAIInsights {
  generateAIInsights(topic: "artificial intelligence", llmProvider: "openai") {
    id
    type
    title
    description
    relevanceScore
  }
}
```

### LangChain Agents
The system uses LangChain's ReAct agents with custom tools:

```typescript
// Tools available to AI agents:
1. PostGeneratorTool - Generate platform-optimized posts
2. TrendAnalysisTool - Analyze current trends
3. ContentSuggestionTool - Generate content ideas
```

### Vector Search
```typescript
// Index tweets for semantic search
await vectorDbService.addDocuments(tweetDocuments);

// Search similar tweets
const results = await vectorDbService.search("AI trends", 10);
```

## 📱 Platform Integration

### X (Twitter)
- **API**: Twitter API v2 + Rettiwt-API
- **Auth**: OAuth 2.0
- **Features**: Tweet posting, media upload, profile monitoring
- **Rate Limits**: Handled with delays and retries

### Instagram
- **API**: Instagram Graph API
- **Auth**: Facebook OAuth
- **Features**: Image/carousel posts, caption, hashtags
- **Media Processing**: Container creation and publishing

### Facebook
- **API**: Facebook Graph API v18.0
- **Auth**: Facebook OAuth
- **Features**: Page posts, media, text content

### TikTok
- **API**: TikTok API v2
- **Auth**: OAuth 2.0
- **Features**: Video upload, caption, publish

## ⚙️ Automated Tasks

### Cron Jobs

**Hourly Tweet Refresh**
```typescript
@Cron(CronExpression.EVERY_HOUR)
async handleHourlyRefresh() {
  // Refresh all monitored profiles
}
```

**Daily AI Insights**
```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleDailyInsights() {
  // Generate insights for all active users
}
```

**Weekly Cleanup**
```typescript
@Cron(CronExpression.EVERY_WEEK)
async handleWeeklyCleanup() {
  // Delete tweets older than 90 days
}
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📈 Performance Optimization

- **Connection Pooling**: PostgreSQL connection management
- **Query Optimization**: Selective field loading, proper indexing
- **Caching**: In-memory LLM model caching
- **Lazy Loading**: Relations loaded on demand
- **Batch Operations**: Bulk insert/update where possible

## 🐛 Error Handling

- **Global Exception Filter**: Consistent error responses
- **Logging**: Winston logger with levels
- **Validation Pipes**: Input validation at endpoints
- **Try-Catch**: Comprehensive error handling
- **Transaction Rollback**: Database consistency

## 🔄 Data Flow Examples

### Publishing a Post
```
1. User creates post → POST entity (DRAFT)
2. User uploads media → Media stored, URLs saved
3. User selects platforms → targetPlatforms array
4. User clicks publish → publishPost mutation
5. For each platform:
   a. Get credentials → Decrypt tokens
   b. Call gateway → Platform-specific API
   c. Save result → PublishedPost entity
6. Update post status → PUBLISHED/FAILED
7. Return result → Updated Post with publishedPosts
```

### Generating AI Insights
```
1. User requests insights → generateAIInsights mutation
2. Load monitored profiles → Get user's profiles
3. Fetch recent tweets → Last 7 days
4. Optional: Vector search → Find relevant tweets by topic
5. Build prompt → Format tweets as JSON
6. Call LLM → OpenAI/Gemini/Ollama
7. Parse response → Extract insights
8. Save to DB → Insight entities
9. Return results → Array of insights
```

## 🚦 API Rate Limits

**Social Media Platforms:**
- X: 50 tweets/hour (enforced by platform)
- Instagram: 25 posts/day per account
- Facebook: 200 posts/day per page
- TikTok: 10 videos/day per account

**Internal Rate Limiting:**
- Monitoring refresh: Max once per hour per profile
- LLM calls: Configurable delays between requests
- File uploads: 8MB per file, 4 files per request

## 📄 GraphQL Schema

The schema is auto-generated at `src/schema.gql` using the code-first approach.

Key types:
- User, Post, PublishedPost
- SocialAccount, Credential
- MonitoredProfile, Tweet
- Insight, LlmCredential

## 🔗 External Dependencies

### Critical Services
- PostgreSQL (database)
- ChromaDB (optional - vector search)
- OAuth providers (X, Facebook, TikTok APIs)
- LLM APIs (OpenAI, Gemini, Ollama)
- Rettiwt API (tweet monitoring)

### NPM Packages
- `@nestjs/core`, `@nestjs/graphql` - Framework
- `@nestjs/typeorm`, `typeorm` - ORM
- `@nestjs/passport`, `passport-jwt` - Auth
- `@langchain/core`, `@langchain/openai` - AI
- `chromadb` - Vector database
- `rettiwt-api` - Twitter scraping
- `twitter-api-v2` - Official Twitter SDK
- `axios` - HTTP client
- `bcrypt` - Password hashing
- `multer` - File uploads

## 🐞 Known Issues & Limitations

- Instagram API requires business accounts
- TikTok video upload has size limitations
- Rettiwt API may be rate-limited
- ChromaDB requires separate deployment
- Token refresh not fully implemented for all platforms

## 🔮 Future Enhancements

- [ ] LinkedIn integration
- [ ] Pinterest integration
- [ ] Advanced scheduling with timezone support
- [ ] Webhook support for real-time updates
- [ ] Redis caching layer
- [ ] Elasticsearch for advanced search
- [ ] GraphQL subscriptions for real-time data
- [ ] Comprehensive API rate limiting
- [ ] Advanced analytics and reporting
- [ ] Team collaboration features
- [ ] Content approval workflows
- [ ] A/B testing for posts

## 📄 License

Copyright © 2025 Jeufutbol. All rights reserved.

## 🤝 Support

For support and questions, please contact the development team.

---

**Built with NestJS, GraphQL, TypeORM, LangChain, and modern TypeScript.**

**API Documentation**: http://localhost:3000/graphql (GraphQL Playground)
