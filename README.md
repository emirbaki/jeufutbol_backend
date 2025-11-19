# JeuHub Backend - Social Media Management API

Welcome to the engine room of **JeuHub**. This is the robust, **NestJS 11**-powered GraphQL API that drives our social media management platform. It handles everything from multi-platform publishing and OAuth authentication to the AI agents that power our insights engine.

## 🚀 Overview

The JeuHub backend is designed to be the heavy lifter. It connects securely to X (Twitter), Instagram, Facebook, TikTok, and YouTube, managing the complexities of each platform's API so the frontend doesn't have to. Beyond just posting, it features a sophisticated AI layer that analyzes trends, generates content, and provides actionable insights to users.

## ✨ Key Features

### 🔐 Secure Core

- **Robust Authentication**: We use Passport.js with JWTs for secure, stateless authentication.
- **OAuth2 Management**: Seamlessly handles the complex OAuth flows for all supported social platforms.
- **Bank-Grade Encryption**: Sensitive credentials (like access tokens) are encrypted with AES-256-GCM before they ever touch the database.
- **Role-Based Access**: Strict data isolation ensures users only see what they own.

### 📝 Content Command Center

- **Universal Publishing**: One API to rule them all. Post to X, Instagram, Facebook, TikTok, and YouTube simultaneously.
- **Smart Workflows**: Draft now, schedule for later, or publish instantly. We handle the lifecycle.
- **Media Management**: Robust handling of images and videos, optimized for each platform's requirements.
- **Bulk Operations**: Need to blast an update everywhere? We've got you covered.

### 🤖 AI & Intelligence

- **LangChain Powered**: We've integrated LangChain to build autonomous agents that can analyze and create.
- **Multi-Model Support**: Whether it's OpenAI, Google Gemini, or Ollama, we support multiple LLM providers.
- **Deep Insights**: Our agents analyze trends and engagement to tell you _what_ to post and _when_.
- **Vector Search**: Integrated ChromaDB for semantic search capabilities, allowing for context-aware insights.

### 📊 Monitoring & Analytics

- **X Profile Watch**: Keep a close eye on specific X (Twitter) profiles. We automatically fetch and index their tweets.
- **Engagement Tracking**: We track likes, retweets, and views to give you a clear picture of performance.
- **Automated Analysis**: Background jobs crunch the numbers hourly to keep your insights fresh.

## 🏗️ Architecture & Tech Stack

We've built this on a foundation of industry-standard, enterprise-ready technologies.

### Core Stack

- **Framework**: **NestJS 11** (TypeScript) - The progressive Node.js framework.
- **API Layer**: GraphQL (Apollo Server) for flexible data fetching, plus REST for specific utility routes.
- **Database**: PostgreSQL with TypeORM for reliable, relational data storage.
- **Vector DB**: ChromaDB for our AI's long-term memory and semantic search.
- **Task Queue**: @nestjs/schedule for handling background jobs and cron tasks.

### Project Structure

The codebase is modular and domain-driven:

```
src/
├── auth/               # Authentication & JWT strategies
├── post/               # Post lifecycle & platform gateways
├── insights/           # AI agents, LLM integration, & Vector DB
├── monitoring/         # X profile tracking & analysis
├── social-accounts/    # OAuth account management
├── upload/             # File upload & storage handling
└── entities/           # TypeORM database definitions
```

## ☁️ Deployment & Infrastructure

Reliability is our priority.

- **Deployment**: We use **Dokploy** for streamlined, automated deployments.
- **Network**: **Cloudflare** sits in front of our API, providing DNS management, DDoS protection, and global caching.

## 🚀 Getting Started

Want to run the API locally? Here's the playbook.

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- ChromaDB (optional, for full AI features)

### Installation

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Copy `.env.example` to `.env` and fill in your database and API keys.

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

We believe in shipping with confidence.

```bash
# Unit Tests
npm run test

# E2E Tests
npm run test:e2e
```

## 🤝 Contributing & Support

Got ideas? Found a bug? We're all ears. Reach out to the development team for support or check the issues tab.

---

**Built with NestJS, GraphQL, and a lot of ☕.**
