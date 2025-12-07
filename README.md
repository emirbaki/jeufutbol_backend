# JeuHub Backend - Social Media Management API

Welcome to the engine room of **JeuHub**. This is the robust, **NestJS 11**-powered GraphQL API that drives our social media management platform. It handles everything from multi-platform publishing and OAuth authentication to the AI agents that power our insights engine, all built on a secure multi-tenant architecture.

## 🚀 Overview

The JeuHub backend is designed to be the heavy lifter. It connects securely to X (Twitter), Instagram, Facebook, TikTok, and YouTube, managing the complexities of each platform's API. It features a sophisticated AI layer for content generation and insights, and a robust multi-tenancy system to support organizations and teams.

## ✨ Key Features

### 🔐 Secure & Scalable Core

- **Multi-Tenancy**: Built-in support for multiple organizations (tenants) with strict data isolation.
- **Robust Authentication**: Passport.js with JWTs, supporting both User sessions and API Key access.
- **Role-Based Access Control (RBAC)**: Manage permissions with ADMIN, MANAGER, and USER roles.
- **OAuth2 Management**: Seamlessly handles OAuth flows for all supported social platforms.
- **Bank-Grade Encryption**: Sensitive credentials are encrypted with AES-256-GCM.

### 👥 Team & Integration

- **User Invitations**: Admins can invite team members via email with role assignment.
- **API Keys**: Generate scoped API keys for third-party integrations (Client Credentials flow).
- **Documentation**: Dedicated guides for [API Integration](../API_INTEGRATION_GUIDE.md) and [User Invitations](../USER_INVITATION_AND_API_KEY_GUIDE.md).

### 📝 Content Command Center

- **Universal Publishing**: Post to X, Instagram, Facebook, TikTok, and YouTube simultaneously.
- **Smart Workflows**: Draft, schedule, and publish with automated lifecycle management.
- **Media Management**: Optimized handling of images and videos for each platform.

### 🤖 AI & Intelligence

- **LangChain Powered**: Autonomous agents for trend analysis and content creation.
- **Multi-Model Support**: OpenAI, Google Gemini, and Ollama integration.
- **Vector Search**: ChromaDB integration for semantic search and context-aware insights. Used Xenova/multilingual-e5-small for embedding documents and queries for better Turkish results.

#### 🛠️ Agent Tools & Capabilities

The AI agent is equipped with a suite of custom tools to perform complex tasks:

- **🌐 Web Search (`web_search`)**: Uses SearXNG to fetch real-time information (news, events, weather) from Google, Bing, and DuckDuckGo.
- **📄 Page Visitor (`visit_page`)**: Scrapes and extracts full text content from URLs to read articles and reports in depth.
- **📝 Post Generation**:
  - `generate_post_template`: Creates platform-specific post drafts with tone, emojis, and hashtags.
  - `analyze_trends`: Analyzes current trends to suggest relevant content.
  - `suggest_content`: Proposes content ideas based on user categories.
- **📲 Social Media Management**:
  - `create_post`: Drafts new posts for multiple platforms.
  - `list_posts`: Retrieves recent posts and their statuses.
  - `publish_post`: Triggers immediate publication of approved posts.
- **💾 Data Access**: Safe SQL access to query system data, insights, and performance metrics.

### 📊 Monitoring & Analytics

- **X Profile Watch**: Automated tracking and indexing of specific X (Twitter) profiles.
- **Engagement Tracking**: Track likes, retweets, and views.
- **Automated Analysis**: Background jobs (BullMQ) for periodic data crunching.

## 🏗️ Architecture & Tech Stack

We've built this on a foundation of industry-standard, enterprise-ready technologies.

### Core Stack

- **Framework**: **NestJS 11** (TypeScript)
- **API Layer**: GraphQL (Apollo Server) + REST
- **Database**: PostgreSQL with TypeORM
- **Vector DB**: ChromaDB
- **Caching & Queues**: **Redis** + **BullMQ**
- **Task Scheduling**: @nestjs/schedule

### Project Structure

The codebase is modular and domain-driven:

```
src/
├── auth/               # Authentication & JWT strategies
├── cache/              # Redis cache configuration
├── credentials/        # Encrypted credential management
├── email/              # Email sending service (Resend)
├── entities/           # TypeORM database definitions
├── graphql/            # GraphQL configuration & scalars
├── insights/           # AI agents, LLM integration, & Vector DB
├── monitoring/         # X profile tracking & analysis
├── post/               # Post lifecycle & platform gateways
├── pubsub/             # Real-time subscriptions (Redis-based)
├── queue/              # BullMQ background job queues
├── social-accounts/    # OAuth account management
├── tenancy/            # Multi-tenancy & tenant isolation
├── tweets/             # Tweet management
├── upload/             # File upload & storage handling
└── user/               # User management
```

## ☁️ Deployment & Infrastructure

- **Deployment**: **Dokploy** for automated deployments.
- **Network**: **Cloudflare** for DNS, DDoS protection, and caching.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- **Redis 6+** (Required for Queues and Caching)
- ChromaDB (Optional, for full AI features)

### Installation

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Copy `.env.example` to `.env` and configure your database, Redis, and API keys.

    ```bash
    cp .env.example .env
    ```

3.  **Database Setup:**
    Run migrations to create the schema.

    ```bash
    npm run migration:run
    ```

4.  **Launch:**
    Start the development server.
    ```bash
    npm run start:dev
    ```
    The GraphQL Playground will be available at `http://localhost:3000/graphql`.

## 🧪 Testing

```bash
# Unit Tests
npm run test

# E2E Tests
npm run test:e2e
```

## 🤝 Contributing & Support

Refer to the [API Integration Guide](./API_INTEGRATION_GUIDE.md) for external access details.

---

**Built with NestJS, GraphQL, and a lot of ☕.**
