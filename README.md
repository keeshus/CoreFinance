# Core Finance

> A modern, self-hosted personal finance dashboard with powerful CSV parsing, a custom rule engine, and optional AI-powered insights via Google Vertex AI.

**Core Finance** is a privacy-first web application designed to help you analyze your personal finances without relying on third-party cloud aggregators. Built entirely as a self-hosted Docker stack, it allows you to upload your bank's CSV exports, visualize your spending trends, establish custom filtering rules, and optionally leverage the power of Google's Gemini models for smart categorization and anomaly detection.

---

## ✨ Features

- **📊 Comprehensive Dashboard**: Instantly view transaction summaries, total asset trends, and an interactive transaction history interface.
- **🏦 Automated CSV Parsing**: Built-in, robust parsers for ING Bank (Main and Savings accounts) exports. It normalizes dates, currencies, balances, and transaction metadata automatically.
- **🧠 Optional Vertex AI Integration**: 
  - **Batch Categorization**: Automatically label transactions in bulk.
  - **Context-Aware Anomaly Detection**: Flag uncharacteristic transactions based on your historical spending behavior.
  - **Smart Rule Proposals**: Proactively suggest new routing or alert rules based on recurring financial activity.
  - *Note: AI features are designed with enterprise-grade privacy (zero data training) and use cost-optimized batched prompts to minimize token usage.*
- **🛠️ Custom Rule Engine**: Define deterministic rules to validate transactions, verify counter-parties, or filter specific payments.
- **🛡️ Privacy-First & Self-Hosted**: Keep full control of your financial data. The application runs locally via Docker Compose, backed by a private PostgreSQL database.
- **⚙️ Dynamic Configuration**: Manage account display names, toggle AI settings, and configure Vertex credentials directly from the frontend UI without modifying environment variables.

---

## 🏗️ Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) (React), Recharts for data visualization, Lucide React for iconography.
- **Backend**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/), `csv-parse` for fast file processing.
- **Database**: [PostgreSQL 18](https://www.postgresql.org/) (utilizing JSONB columns for flexible AI metadata storage).
- **Infrastructure**: Docker, Docker Compose, Nginx (Reverse Proxy).
- **AI SDK**: `@google-cloud/vertexai` (Gemini Flash optimized).

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your machine.

### Quickstart (Production / Normal Use)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/core-finance.git
   cd core-finance
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
