import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { pool, getSettings } from '../db.js';

export class AIService {
  constructor(config, logger = console.log) {
    if (!config || !config.apiKey) {
      throw new Error('AI Studio configuration missing (apiKey)');
    }

    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || 'gemini-2.0-flash';
    this.grounding = config.grounding || false;
    this.logger = logger;
    this.logger(`Initialized with model: ${this.modelName}, grounding: ${this.grounding}`);
  }

  async getModel(excludeAnomaly = false) {
    const properties = {
      id: { type: SchemaType.STRING },
      ai_category: { type: SchemaType.STRING },
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
            type: { type: SchemaType.STRING },
            category: { type: SchemaType.STRING },
            name: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            expected_amount: { type: SchemaType.NUMBER },
            amount_margin: { type: SchemaType.NUMBER }
          },
          required: ['type', 'name', 'description']
        }
      }
    };

    const required = ['id', 'ai_category'];

    if (!excludeAnomaly) {
      properties.is_anomalous = { type: SchemaType.BOOLEAN };
      properties.anomaly_reason = { type: SchemaType.STRING };
      required.push('is_anomalous');
    }

    const tools = [];
    if (this.grounding) {
      tools.push({ googleSearchRetrieval: {} });
    }

    return this.genAI.getGenerativeModel({
      model: this.modelName,
      tools,
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
    this.logger('Fetching historical context...');
    const start = Date.now();
    try {
      const result = await pool.query(`
        SELECT 
          counterparty, 
          COUNT(*) as frequency, 
          AVG(amount) as avg_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount
        FROM transactions
        WHERE date > CURRENT_DATE - INTERVAL '1 year'
          AND (metadata->>'review_status' IS DISTINCT FROM 'negated')
        GROUP BY counterparty
        HAVING COUNT(*) > 1
        ORDER BY frequency DESC
        LIMIT 100
      `);
      this.logger(`Historical context fetched in ${Date.now() - start}ms. Found ${result.rows.length} records.`);
      return result.rows;
    } catch (err) {
      this.logger(`Failed to fetch historical context: ${err.message}`);
      return [];
    }
  }

  async processBatch(transactions, activeRules = [], options = {}) {
    const historicalContext = options.historicalContext || [];
    const model = await this.getModel(options.disableAnomalyDetection);
    const dbCategories = await getSettings('categories') || [];
    const onTransactionEnriched = options.onTransactionEnriched || (async () => {});

    const categoryDescriptions = dbCategories.map(c => `- ${c.name}: ${c.description || ''}`).join('\n');
    const categoryNames = dbCategories.map(c => c.name).join(', ');

    const taskList = options.disableAnomalyDetection
      ? `1. 'ai_category': The single best matching category from the available categories list.
      2. 'rule_violations': Array of objects for any active validation rules that were violated.
      3. 'proposed_rules': Propose new rules (either validation or categorization) based on detected patterns.`
      : `1. 'ai_category': The single best matching category from the available categories list.
      2. 'is_anomalous': Boolean, true if this transaction deviates significantly from historical patterns.
      3. 'anomaly_reason': String (optional), explanation of the anomaly.
      4. 'rule_violations': Array of objects for any active validation rules that were violated.
      5. 'proposed_rules': Propose new rules (either validation or categorization) based on detected patterns.`;

    const prompt = `
      You are a financial analysis assistant.
      IMPORTANT: You MUST return a JSON array of objects.
      DO NOT include markdown formatting tags like \`\`\`json or \`\`\`.
      Return only the raw JSON.
      Analyze the following batch of recent transactions and return a JSON array.
      
      ${options.disableAnomalyDetection ? '' : `### Historical Context (Normal Behavior):\n${JSON.stringify(historicalContext)}`}

      ### Available Categories and Definitions:
      ${categoryDescriptions}

      ### Active Rules to Check (Patterns can be regex or natural language descriptions):
      ${JSON.stringify(activeRules)}

      ### Transactions to Analyze:
      ${JSON.stringify(transactions.map(t => ({
        id: t.id,
        date: t.date,
        description: t.name_description,
        counterparty: t.counterparty,
        amount: t.amount,
        currency: t.currency,
        metadata: t.metadata
      })))}

      ### Task:
      For each transaction, provide:
      ${taskList}

         - 'ai_category' MUST strictly be one of: ${categoryNames}.
         - Categorization rules tell you which category to assign. If a categorization rule matches a transaction, you MUST assign the category specified in that rule. DO NOT create a rule_violation for a matched categorization rule. A successful match is not a violation.
         - Validation rules are used to detect anomalies. ONLY validation rules can generate 'rule_violations', and ONLY when the transaction fails to meet the expected criteria of the validation rule.
         - Each rule_violations object MUST have:
           - 'rule_id': The ID of the violated validation rule.
           - 'reason': A brief, clear explanation of WHY the validation rule was violated (e.g. "Expected counterparty Unive BV but found ABN", "Amount $110 exceeds margin of $5 for expected $100").
         - If NO validation rules are violated, return an empty array []. NEVER return ["none"] or similar placeholders.
         
         A validation rule is violated if:
         - The transaction doesnt comply to the given description.
         - IF it has an 'expected_amount' and 'amount_margin', the transaction amount is NOT within [expected_amount - amount_margin, expected_amount + amount_margin].
         
         - Each proposed_rules object MUST have:
           - 'type': 'validation' OR 'categorization'
           - 'name': Natural language rule name (e.g. Health Insurance), 
           - 'description': Natural language description of the rule (e.g. All transactions to AXA for health insurance),
           - IF type='validation': Provide 'expected_amount' and 'amount_margin' (a reasonable margin if the amount varies slightly, or 0 if it's always exact)
           - IF type='categorization': Provide 'category' (MUST be exactly one of: ${categoryNames}).

      Return ONLY a JSON array of objects.
    `;

    this.logger(`Building Gemini prompt: ${transactions.length} transactions, ${activeRules.length} active rules, ${historicalContext.length} historical insight records.`);
    
    try {
      this.logger(`Sending request to Gemini (${this.modelName}). Prompt length: ${prompt.length} chars.`);
      const startCall = Date.now();
      
      // Use AbortController for a 120s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      let result;
      try {
        result = await model.generateContent(prompt, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      
      const fullText = result.response.text();
      
      this.logger(`Response received in ${(Date.now() - startCall) / 1000}s. Length: ${fullText.length} chars.`);
      
      try {
        // Clean up markdown code blocks if the model included them despite instructions
        const cleanText = fullText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(cleanText);
        this.logger(`Successfully parsed ${parsed.length} items from AI response.`);
        
        // Call the enrichment callback for each item to maintain compatibility with worker logic
        for (const item of parsed) {
          const enriched = {
            ...item,
            is_anomalous: options.disableAnomalyDetection ? false : (item.is_anomalous || false),
            anomaly_reason: options.disableAnomalyDetection ? '' : (item.anomaly_reason || '')
          };
          await onTransactionEnriched(enriched);
        }

        return parsed.map(item => ({
          ...item,
          is_anomalous: options.disableAnomalyDetection ? false : (item.is_anomalous || false),
          anomaly_reason: options.disableAnomalyDetection ? '' : (item.anomaly_reason || '')
        }));
      } catch (err) {
        this.logger(`Failed to parse AI response: ${fullText.substring(0, 100)}...`);
        throw new Error('AI response was not valid JSON');
      }
    } catch (err) {
      this.logger(`AI Call failed: ${err.message}`);
      throw err;
    }
  }

  static async listModels(apiKey) {
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
