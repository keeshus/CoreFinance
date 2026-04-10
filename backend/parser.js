import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseDate } from 'date-fns';

/**
 * Utility functions for parsing
 */
export const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  if (typeof amountStr === 'number') return amountStr;
  
  let clean = amountStr.replace(/\s/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    clean = clean.replace(/,/g, '');
  } else {
    if (lastComma !== -1) clean = clean.replace(',', '.');
  }
  
  return parseFloat(clean);
};

export const parseStandardDate = (dateStr) => {
  if (!dateStr) return null;
  let parsed;
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      parsed = parseDate(dateStr, 'yyyy-MM-dd', new Date());
    } else {
      parsed = parseDate(dateStr, 'dd-MM-yyyy', new Date());
    }
  } else {
    parsed = parseDate(dateStr, 'yyyy-MM-dd', new Date());
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const extractTime = (notifications) => {
  if (!notifications) return null;
  const timeRegex = /(\d{2}):(\d{2})/;
  const match = notifications.match(timeRegex);
  if (match) {
    return `${match[1]}:${match[2]}:00`;
  }
  return null;
};

/**
 * Parser Strategy Registry
 */
class ParserRegistry {
  constructor() {
    this.strategies = [];
  }

  register(strategy) {
    this.strategies.push(strategy);
  }

  detectAndParse(records) {
    for (const strategy of this.strategies) {
      if (strategy.identify(records[0])) {
        return records.map(record => strategy.parse(record)).filter(Boolean);
      }
    }
    return null;
  }
}

/**
 * ING Main Strategy
 */
const IngMainStrategy = {
  identify: (row) => {
    return (row['Date'] || row['Datum']) && (row['Amount (EUR)'] || row['Bedrag (EUR)']);
  },
  parse: (row) => {
    const date = row['Date'] || row['Datum'];
    const amountEUR = row['Amount (EUR)'] || row['Bedrag (EUR)'];
    const debitCredit = row['Debit/credit'] || row['Af Bij'];
    const notifications = row['Notifications'] || row['Mededelingen'];
    const resultingBalance = row['Resulting balance'] || row['Saldo na mutatie'];
    const nameDescription = row['Name / Description'] || row['Naam / Omschrijving'];

    let parsedDate;
    if (date.length === 8) {
      const p = parseDate(date, 'yyyyMMdd', new Date());
      parsedDate = new Date(p.getFullYear(), p.getMonth(), p.getDate());
    } else {
      parsedDate = parseStandardDate(date);
    }

    const amount = parseAmount(amountEUR);
    const isDebit = debitCredit === 'Debit' || debitCredit === 'Af';

    return {
      date: parsedDate,
      account: row['Account'] || row['Rekening'],
      name_description: nameDescription,
      counterparty: row['Counterparty'] || row['Tegenrekening'] || 'Unknown',
      amount: (isDebit ? -1 : 1) * amount,
      currency: 'EUR',
      type: row['Transaction type'] || row['Mutatiesoort'],
      time: extractTime(notifications),
      source: 'ing_main',
      external_id: `ing_main_${date}_${amountEUR}_${resultingBalance}_${nameDescription}`,
      metadata: {
        code: row['Code'],
        notifications,
        resulting_balance: resultingBalance,
        tag: row['Tag']
      }
    };
  }
};

/**
 * ING Savings Strategy
 */
const IngSavingsStrategy = {
  identify: (row) => {
    const accountName = row['Account name'] || row['Naam rekening'];
    return (row['Amount'] || row['Bedrag']) && 
           (row['Date'] || row['Datum']) && 
           (accountName === 'savings account' || accountName === 'Spaarrekening');
  },
  parse: (row) => {
    const date = row['Date'] || row['Datum'];
    const amountStr = row['Amount'] || row['Bedrag'];
    const debitCredit = row['Debit/credit'] || row['Af Bij'];
    const notifications = row['Notifications'] || row['Mededelingen'];
    const resultingBalance = row['Resulting balance'] || row['Saldo na mutatie'];
    const description = row['Description'] || row['Omschrijving'];

    const p = parseDate(date, 'yyyy-MM-dd', new Date());
    const parsedDate = new Date(p.getFullYear(), p.getMonth(), p.getDate());

    const amount = parseAmount(amountStr);
    const isDebit = debitCredit === 'Debit' || debitCredit === 'Af';

    return {
      date: parsedDate,
      account: row['Account'] || row['Rekening'],
      name_description: description,
      counterparty: row['Counterparty'] || row['Tegenrekening'] || 'Unknown',
      amount: (isDebit ? -1 : 1) * amount,
      currency: row['Currency'] || row['Munteenheid'] || 'EUR',
      type: row['Transaction type'] || row['Mutatiesoort'],
      time: extractTime(notifications),
      source: 'ing_savings',
      external_id: `ing_savings_${date}_${amountStr}_${resultingBalance}_${description}`,
      metadata: {
        account_name: row['Account name'] || row['Naam rekening'],
        notifications,
        resulting_balance: resultingBalance
      }
    };
  }
};

const registry = new ParserRegistry();
registry.register(IngMainStrategy);
registry.register(IngSavingsStrategy);

export const parseBankCsv = (content) => {
  const delimiter = content.includes(';') ? ';' : ',';
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    bom: true,
    quote: '"'
  });

  if (records.length === 0) return [];
  
  const parsed = registry.detectAndParse(records);
  return parsed || [];
};

export const parseBalanceCsv = (content) => {
  const delimiter = content.includes(';') ? ';' : '\t';
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    bom: true,
    relax_column_count: true,
    quote: '"',
    ltrim: true,
    rtrim: true
  });

  return records.map(row => {
    const balanceValue = row['Book balance'] || row['Boeksaldo'] || row['Saldo'] || Object.values(row)[3] || Object.values(row)[4];
    const dateValue = row['Date'] || row['Datum'] || Object.values(row)[0];
    const accountValue = row['Account'] || row['Rekening'] || Object.values(row)[1];

    const parsedDate = parseStandardDate(dateValue);
    const parsedBalance = parseAmount(balanceValue);

    return {
      date: parsedDate,
      account: accountValue,
      balance: parsedBalance
    };
  }).filter(b => !isNaN(b.balance) && b.date instanceof Date && !isNaN(b.date.getTime()));
};
