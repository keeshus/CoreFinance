import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { pool } from '../db.js';

export class AIService {
  constructor(config) {
    if (!config || !config.apiKey) {
      throw new Error('AI Studio configuration missing (apiKey)');
    }

    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || 'gemini-2.0-flash';
    console.log(`[AIService] Initialized with model: ${this.modelName}`);
    
    this.categories = [
      'Income', 'Housing', 'Groceries', 'Dining & Drinks', 'Transportation',
      'Shopping', 'Health & Wellness', 'Insurance', 'Subscriptions',
      'Education', 'Travel & Leisure', 'Gifts & Donations', 'Finance & Taxes',
      'Savings & Investments', 'Payment requests', 'Other'
    ];
  }

  async getModel(excludeAnomaly = false) {
    const properties = {
      id: { type: SchemaType.STRING },
      ai_categories: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      },
      rule_violations: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            rule_id: { type: SchemaType.STRING },
            reason: { type: SchemaType.STRING }
          },
          required: ['rule_id', 'reason']
        }
      },
      proposed_rules: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            expected_amount: { type: SchemaType.NUMBER },
            amount_margin: { type: SchemaType.NUMBER }
          },
          required: ['name', 'description']
        }
      }
    };

    const required = ['id', 'ai_categories'];

    if (!excludeAnomaly) {
      properties.is_anomalous = { type: SchemaType.BOOLEAN };
      properties.anomaly_reason = { type: SchemaType.STRING };
      required.push('is_anomalous');
    }

    return this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties,
            required
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

  async processBatch(transactions, activeRules = [], options = {}) {
    const historicalContext = options.disableAnomalyDetection ? [] : await this.getHistoricalContext();
    const model = await this.getModel(options.disableAnomalyDetection);

    const taskList = options.disableAnomalyDetection
      ? `1. 'ai_categories': Array of 1-3 best matching categories from: ${this.categories.join(', ')}.
      2. 'rule_violations': Array of objects for any active rules that were violated.
      3. 'proposed_rules': ONLY for recurring transactions (monthly, quarterly, etc.) based on the current transaction.`
      : `1. 'ai_categories': Array of 1-3 best matching categories from: ${this.categories.join(', ')}.
      2. 'is_anomalous': Boolean, true if this transaction deviates significantly from historical patterns for this counterparty.
      3. 'anomaly_reason': String (optional), explanation of the anomaly.
      4. 'rule_violations': Array of objects for any active rules that were violated.
      5. 'proposed_rules': ONLY for recurring transactions (monthly, quarterly, etc.) based on historicalContext and current transaction.`;

    const prompt = `
      You are a financial analysis assistant. 
      Analyze the following batch of recent transactions and return a JSON array.
      
      ${options.disableAnomalyDetection ? '' : `### Historical Context (Normal Behavior):\n${JSON.stringify(historicalContext)}`}

      ### Active Rules to Check (Patterns can be regex or natural language descriptions):
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
      ${taskList}

         Each rule_violations object MUST have:
         - 'rule_id': The ID of the violated rule.
         - 'reason': A brief, clear explanation of WHY the rule was violated (e.g. "Expected counterparty Unive BV but found ABN", "Amount $110 exceeds margin of $5 for expected $100").
         
         If NO rules are violated, return an empty array []. NEVER return ["none"] or similar placeholders.
         
         A rule is violated if:
         - The transaction doesnt comply to the given description.
         - IF it has an 'expected_amount' and 'amount_margin', the transaction amount is NOT within [expected_amount - amount_margin, expected_amount + amount_margin].
         
         Each proposed_rules object MUST have:
         - 'name': Natural language rule name (e.g. Health Insurance), 
         - 'description': Natural language description of the rule (e.g. All transactions to AXA for health insurance),
         - 'expected_amount': 123.45, (the recurring amount)
         - 'amount_margin': 5.00 (a reasonable margin if the amount varies slightly, or 0 if it's always exact)

      Return ONLY a JSON array of objects.
    `;

    console.log(`[AIService] Sending request to Gemini (${this.modelName})...`);
    const result = await model.generateContent(prompt);
    console.log(`[AIService] Received response from Gemini`);
    const response = await result.response;
    const text = response.text();
    console.log(`[AIService] Response text length: ${text.length}`);
    
    try {
      const parsed = JSON.parse(text);
      // Ensure all required fields exist even if excluded from prompt
      return parsed.map(item => ({
        ...item,
        is_anomalous: options.disableAnomalyDetection ? false : (item.is_anomalous || false),
        anomaly_reason: options.disableAnomalyDetection ? '' : (item.anomaly_reason || '')
      }));
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
