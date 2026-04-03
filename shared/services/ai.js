import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { pool } from '../db.js';

export class AIService {
  constructor(config) {
    if (!config || !config.apiKey) {
      throw new Error('AI Studio configuration missing (apiKey)');
    }

    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || 'gemini-2.0-flash';
    
    this.categories = [
      'Income', 'Housing', 'Groceries', 'Dining & Drinks', 'Transportation',
      'Shopping', 'Health & Wellness', 'Insurance', 'Subscriptions',
      'Education', 'Travel & Leisure', 'Gifts & Donations', 'Finance & Taxes',
      'Savings & Investments', 'Other'
    ];
  }

  async getModel() {
    return this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              ai_categories: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING }
              },
              is_anomalous: { type: SchemaType.BOOLEAN },
              anomaly_reason: { type: SchemaType.STRING },
              rule_violations: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING }
              },
              proposed_rules: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING }
              }
            },
            required: ['id', 'ai_categories', 'is_anomalous']
          }
        }
      },
    });
  }

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
      For each transaction, provide:
      1. 'ai_categories': Array of 1-3 best matching categories from: ${this.categories.join(', ')}.
      2. 'is_anomalous': Boolean, true if this transaction deviates significantly from historical patterns for this counterparty.
      3. 'anomaly_reason': String (optional), explanation of the anomaly.
      4. 'rule_violations': Array of IDs of any active rules that were violated.
      5. 'proposed_rules': Array of strings representing NEW suggested rules (regex-like patterns) based on this transaction's patterns.

      Return ONLY a JSON array of objects.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    try {
      return JSON.parse(text);
    } catch (err) {
      console.error('Failed to parse AI response:', text);
      throw new Error('AI response was not valid JSON');
    }
  }

  static async listModels(apiKey) {
    // Note: The GoogleGenerativeAI SDK currently doesn't have a direct listModels method
    // in the same way as the REST API, but we can use fetch for this.
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      if (data.models) {
        return data.models
          .filter(m => m.supportedGenerationMethods.includes('generateContent'))
          .map(m => ({
            name: m.name.replace('models/', ''),
            displayName: m.displayName,
            description: m.description
          }));
      }
      return [];
    } catch (err) {
      console.error('Failed to list models:', err);
      return [];
    }
  }
}
