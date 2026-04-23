# Core Finance

> A modern, self-hosted personal finance dashboard with powerful CSV parsing, a custom rule engine, and AI-powered insights via Google AI Studio (Gemini).

**Core Finance** is a privacy-first web application designed to help you analyze your personal finances without relying on third-party cloud aggregators. Built entirely as a self-hosted Docker stack, it allows you to automatically synchronize bank data, upload bank CSV exports, visualize spending trends, establish custom filtering rules, and leverage Google's Gemini models for smart categorization and anomaly detection.

---

## ✨ Features

- **📊 Comprehensive Dashboard**: Instantly view transaction summaries, total asset trends, and an interactive transaction history interface with advanced filtering and search.
- **🏦 Automated Synchronization (Ponto API)**: Securely connect to over 1,700 European banks via the Ponto API for automated transaction and balance synchronization.
- **📂 Verified CSV Import**: Robust parsers for ING Bank (Main, Savings, and Dutch-localized headers). Includes a **Verification Mode** that cross-checks imported transactions against official balance overviews to ensure 100% accuracy.
- **🧠 AI-Powered Insights (Google AI Studio)**: 
  - **Batch Enrichment**: Automatically categorize and label transactions in bulk using Gemini 2.0 Flash.
  - **Anomaly Detection**: Flag uncharacteristic transactions based on historical spending behavior and user-defined baselines.
  - **Smart Rule Proposals**: Proactively suggest new routing or validation rules based on recurring activity.
  - **Lookalike Detection**: Find similar historical transactions to ensure consistency in categorization.
- **🛠️ Custom Rule Engine**: Define deterministic rules to validate transactions, verify counter-parties, or filter payments. Supports **amount-based validation** and **deviation filtering**.
- **📅 Subscription Management**: Automatically detect and track recurring subscriptions, including frequency and next billing dates.
- **🔔 Real-time Notifications**: Web Push notifications for important alerts, sync status, and transaction deviations.
- **⚙️ Background Processing**: Reliable job execution powered by **BullMQ** and **Valkey** (Redis-compatible) with a dedicated multi-worker registry and real-time progress tracking.
- **🛡️ Security & Privacy**: 
  - **JWT Authentication**: Secure login with protected routes.
  - **Self-Hosted**: Keep full control of your financial data. The application runs locally via Docker Compose, backed by a private PostgreSQL database.

---

## 🏗️ Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) (React), Recharts for data visualization, Lucide React for iconography.
- **Backend**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/).
- **Worker**: Dedicated background worker for AI processing, Ponto synchronization, and subscription detection.
- **Database**: [PostgreSQL 18](https://www.postgresql.org/) (JSONB for flexible metadata).
- **Queue/Cache**: [Valkey](https://valkey.io/) (Redis replacement) & [BullMQ](https://bullmq.io/).
- **Infrastructure**: Docker, Docker Compose, Nginx (Reverse Proxy).
- **AI SDK**: `@google/generative-ai` (Gemini 2.0 Flash optimized).
- **Security**: JWT (JSON Web Tokens), bcrypt for password hashing.
- **Notifications**: Web Push API (VAPID).

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed.

### Quickstart

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/core-finance.git
   cd core-finance
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and set your JWT_SECRET and VAPID keys
   ```

3. **Start the application stack**:
   ```bash
   docker-compose up -d
   ```
   This initializes the database, backend, worker, frontend, and Nginx proxy.

4. **Setup & Access**:
   Navigate to [http://localhost:8080](http://localhost:8080). On first run, you will be prompted to create an admin account.

---

## 🤖 Configuration

### AI Insights
The application utilizes Google's **Gemini 2.0 Flash** models via Google AI Studio. 
1. Obtain an API Key from [Google AI Studio](https://aistudio.google.com/).
2. Navigate to **Settings > AI Configuration** in the dashboard.
3. Enter your Gemini API Key and toggle desired features (Categorization, Anomaly Detection, Grounding).

### Ponto API (Bank Sync)
To enable automated bank synchronization:
1. Register at the [Ponto Developer Portal](https://myponto.com).
2. Create an integration to get your **Client ID** and **Client Secret**.
3. Configure these in **Settings > Ponto Config** and authorize your bank accounts.

---

## 💻 Development Guide

If you wish to modify the application or run it in a local development environment:

1. **Start the database and Valkey**:
   ```bash
   docker-compose up -d db valkey
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the services**:
   - Backend: `npm run backend:dev`
   - Frontend: `npm run frontend:dev`
   - Worker: `npm run worker:dev`

---

## 📂 Project Structure

```text
core-finance/
├── backend/        # Express API server (Routes: transactions, rules, ponto, jobs, subscriptions, notifications)
├── frontend/       # Next.js React dashboard & components
├── worker/         # Background job processor (BullMQ workers)
├── shared/         # Shared logic (DB utilities, AI services, parser, Ponto client)
├── nginx/          # Reverse proxy and SSL configuration
├── scripts/        # Utility scripts (version syncing, etc.)
├── docker-compose.yml
└── package.json    # Monorepo scripts
```

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
