# Core Finance

> A modern, self-hosted personal finance dashboard with powerful CSV parsing, a custom rule engine, and AI-powered insights via Google AI Studio (Gemini).

**Core Finance** is a privacy-first web application designed to help you analyze your personal finances without relying on third-party cloud aggregators. Built entirely as a self-hosted Docker stack, it allows you to automatically synchronize bank data, upload bank CSV exports, visualize spending trends, establish custom filtering rules, and leverage Google's Gemini models for smart categorization and anomaly detection.

---

## ✨ Features

- **📊 Comprehensive Dashboard**: Instantly view transaction summaries, total asset trends, and an interactive transaction history interface.
- **🏦 Automated Synchronization (Ponto API)**: Securely connect to over 1,700 European banks via the Ponto API for automated transaction and balance synchronization.
- **📂 Verified CSV Import**: Robust parsers for ING Bank (Main, Savings, and Dutch-localized headers). Includes a **Verification Mode** that cross-checks imported transactions against official balance overviews to ensure 100% accuracy.
- **🧠 AI-Powered Insights (Google AI Studio)**: 
  - **Batch Enrichment**: Automatically categorize and label transactions in bulk.
  - **Anomaly Detection**: Flag uncharacteristic transactions based on historical spending behavior.
  - **Smart Rule Proposals**: Proactively suggest new routing or validation rules based on recurring activity.
  - **Baseline Mode**: Option to import data without anomaly detection to establish your initial financial history.
- **🛠️ Custom Rule Engine**: Define deterministic rules to validate transactions, verify counter-parties, or filter payments. Supports **amount-based validation** and **deviation filtering**.
- **⚙️ Background Processing**: Reliable job execution powered by **BullMQ** and **Valkey** (Redis-compatible) with a dedicated multi-worker registry.
- **🛡️ Privacy-First & Self-Hosted**: Keep full control of your financial data. The application runs locally via Docker Compose, backed by a private PostgreSQL database.

---

## 🏗️ Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) (React), Recharts for data visualization, Lucide React for iconography.
- **Backend**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/).
- **Worker**: Dedicated background worker for AI and Ponto synchronization tasks.
- **Database**: [PostgreSQL 18](https://www.postgresql.org/) (JSONB for flexible metadata).
- **Queue/Cache**: [Valkey](https://valkey.io/) (Redis replacement) & [BullMQ](https://bullmq.io/).
- **Infrastructure**: Docker, Docker Compose, Nginx (Reverse Proxy).
- **AI SDK**: `@google/generative-ai` (Gemini 1.5 Flash optimized).

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

2. **Start the application stack**:
   ```bash
   docker-compose up -d
   ```
   This initializes the database, backend, worker, frontend, and Nginx proxy.

3. **Access the dashboard**:
   Navigate to [http://localhost:8080](http://localhost:8080).

---

## 🤖 Configuration

### AI Insights
The application utilizes Google's **Gemini 1.5 Flash** models via Google AI Studio. 
1. Obtain an API Key from [Google AI Studio](https://aistudio.google.com/).
2. Navigate to **Settings** in the dashboard.
3. Enter your Gemini API Key and toggle desired features (Categorization, Anomaly Detection).

### Ponto API (Bank Sync)
To enable automated bank synchronization:
1. Register at the [Ponto Developer Portal](https://myponto.com).
2. Create an integration to get your **Client ID** and **Client Secret**.
3. Configure these in the **Settings** tab and authorize your bank accounts.

---

## 📂 Project Structure

```text
core-finance/
├── backend/        # Express API server (Routes: transactions, rules, ponto, jobs)
├── frontend/       # Next.js React dashboard & components
├── worker/         # Background job processor (BullMQ workers)
├── shared/         # Shared logic (DB utilities, AI services, validation)
├── nginx/          # Reverse proxy configuration
├── docker-compose.yml
└── package.json    # Monorepo scripts
```

2. **Start the application stack**:
   ```bash
   docker-compose up -d
   ```
   This command builds the frontend and backend images, initializes the PostgreSQL database, and configures the Nginx reverse proxy.

3. **Access the dashboard**:
   Open your browser and navigate to [http://localhost:8080](http://localhost:8080).

---

## 💻 Development Guide

If you wish to modify the application or run it in a local development environment:

1. **Start the database only**:
   ```bash
   docker-compose up -d db
   ```

2. **Install dependencies**:
   *(Requires Node.js installed locally)*
   ```bash
   npm install
   ```

3. **Run the Backend (with Nodemon for hot-reloading)**:
   ```bash
   npm run backend:dev
   ```

4. **Run the Frontend**:
   ```bash
   npm run frontend:dev
   ```
   The frontend will be available at [http://localhost:3000](http://localhost:3000) and the API at `http://localhost:3000/api`. *(Note: Port 3000 is used natively by Express; Next.js will likely bind to another available port if 3000 is taken, or you can utilize the Next.js dev server configuration).*

---

## 🤖 Vertex AI Configuration

The application is engineered to utilize Google's **Gemini Flash** models via Vertex AI for incredibly fast and cost-effective financial insights. 

To enable AI features:
1. Navigate to the **Settings** tab in the Core Finance dashboard.
2. Enter your Google Cloud Project ID, Location (e.g., `us-central1`), Client Email, and Private Key.
3. Toggle the desired features: Categorization, Anomaly Detection, and Smart Rules.
4. Save the configuration. The credentials are encrypted and stored safely in your local PostgreSQL database.

*To ensure cost efficiency, the backend groups hundreds of transactions into single batched prompts rather than making individual API calls, and summarizes historical data rather than passing raw context to the LLM.*

---

## 📂 Project Structure

```text
core-finance/
├── backend/                  # Node.js/Express API server
│   ├── routes/               # API endpoint definitions (transactions, settings, upload, rules)
│   ├── services/             # Core business logic (AI integration, etc.)
│   ├── db.js                 # PostgreSQL connection and initialization
│   ├── index.js              # Express app entry point
│   ├── parser.js             # Robust CSV parsing logic (ING specific)
│   └── Dockerfile            # Backend container definition
├── frontend/                 # Next.js React frontend
│   ├── components/           # Reusable UI components (Dashboard, Settings, Upload, etc.)
│   ├── pages/                # Next.js page routing
│   ├── next.config.js        # Next.js configuration
│   └── Dockerfile            # Frontend container definition
├── nginx/                    # Nginx reverse proxy configuration
├── plans/                    # Documentation and architectural plans (e.g., Vertex AI integration)
├── docker-compose.yml        # Main Docker orchestration file
├── docker-compose.debug.yml  # Docker orchestration for debugging
└── package.json              # Monorepo dependencies and scripts
```

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
