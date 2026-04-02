import { VertexAI } from '@google-cloud/vertexai';
import { pool } from '../db.js';

export class AIService {
  constructor(config) {
    if (!config || !config.projectId || !config.location) {
      throw new Error('Vertex AI configuration missing (projectId, location)');
    }

    const vertexOptions = { project: config.projectId, location: config.location };
    
    if (config.serviceAccountJson) {
      try {
        vertexOptions.googleAuthOptions = {
          credentials: JSON.parse(config.serviceAccountJson)
        };
      } catch (err) {
        console.error('Failed to parse serviceAccountJson:', err);
      }
    }

    this.vertexAI = new VertexAI(vertexOptions);
    this.modelName = config.model || 'gemini-3-flash-preview';
    
    this.categories = [
      'Income',
      'Housing',
      'Groceries',
      'Dining & Drinks',
      'Transportation',
      'Shopping',
      'Health & Wellness',
      'Insurance',
      'Subscriptions',
      'Education',
      'Travel & Leisure',
      'Gifts & Donations',
      'Finance & Taxes',
      'Savings & Investments',
      'Other'
    ];
  }

  async getModel() {
    return this.vertexAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  /**
   * Aggregates historical transaction data to provide context for AI.
   */
  async getHistoricalContext() {
    const result = await pool.query(`
      SELECT 
        counterparty, 
        COUNT(*) as frequency, 
        AVG(amount) as avg_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
      FROM transactions
      WHERE date > CURRENT_DATE - INTERVAL '1 year'
      GROUP BY counterparty
      HAVING COUNT(*) > 1
      ORDER BY frequency DESC
      LIMIT 100
    `);

    return result.rows;
  }

  /**
   * Processes a batch of transactions for categorization, anomalies, and rule proposals.
   */
  async processBatch(transactions, activeRules = []) {
    const historicalContext = await this.getHistoricalContext();
    const model = await this.getModel();

    const prompt = `
      You are a financial analysis assistant. 
      Analyze the following batch of recent transactions and return a JSON array.
      
      ### Historical Context (Normal Behavior):
      ${JSON.stringify(historicalContext)}

      ### Active Rules to Check:
      ${JSON.stringify(activeRules)}

      ### Transactions to Analyze:
      ${JSON.stringify(transactions.map(t => ({
        id: t.id,
        date: t.date,
        description: t.name_description,
        counterparty: t.counterparty,
        amount: t.amount,
        currency: t.currency
      })))}

      ### Task:
      1. **Categorize**: Assign ONE OR MORE relevant categories to each transaction from this list: ${this.categories.join(', ')}.
      2. **Anomaly Detection**: Flag transactions that seem strange compared to the historical context or typical spending.
      3. **Rule Checking**: Evaluate if any active rules are violated (e.g., if a transaction looks like car insurance but the counterparty is not the one specified in the rule).
      4. **Smart Rule Proposals**: Suggest new rules based on recurring patterns in this batch that weren't in the historical context.

      ### Return Format (JSON Array of objects):
      [{
        "id": number,
        "ai_categories": string[],
        "is_anomalous": boolean,
        "anomaly_reason": string | null,
        "rule_violations": string[],
        "proposed_rules": string[]
      }]
    `;

    const response = await model.generateContent(prompt);
    const text = response.response.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  }
}
