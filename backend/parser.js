import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseDate } from 'date-fns';

const parseIngMainDate = (dateStr) => parseDate(dateStr, 'yyyyMMdd', new Date());
const parseIngSavingsDate = (dateStr) => parseDate(dateStr, 'yyyy-MM-dd', new Date());

const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  if (typeof amountStr === 'number') return amountStr;
  
  // Normalize string:
  // 1. Remove all spaces
  // 2. Determine if it uses ',' or '.' as decimal separator.
  // European format: 1.295,14
  // We want to remove the '.' (thousands) and change ',' to '.' (decimal)
  let clean = amountStr.replace(/\s/g, '');
  
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // European format 1.234,56
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US format 1,234.56
    clean = clean.replace(/,/g, '');
  } else {
    // No separators or just one type, assume it's just a simple number string
    // but handle the case where it might be "1234,56" without thousands separator
    if (lastComma !== -1) clean = clean.replace(',', '.');
  }
  
  return parseFloat(clean);
};

const parseBalanceDate = (dateStr) => parseDate(dateStr, 'yyyy-MM-dd', new Date());

const extractTime = (notifications) => {
  if (!notifications) return null;
  // Look for patterns like HH:mm in notifications
  // Examples from CSV:
  // "05-01-2020 17:32"
  // "03/01/2020 12:56"
  // "03/01/2020 08:31"
  const timeRegex = /(\d{2}):(\d{2})/;
  const match = notifications.match(timeRegex);
  if (match) {
    return `${match[1]}:${match[2]}:00`;
  }
  return null;
};

export const parseBalanceCsv = (content) => {
  // Support both semicolon and tab delimiters
  const delimiter = content.includes(';') ? ';' : '\t';
  
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    bom: true,
    relax_column_count: true
  });

  return records.map(row => {
    // Find the balance column - it might be 'Book balance', 'Boeksaldo', 'Saldo',
    // or sometimes it's the 4th/5th column in a tab-separated file without headers
    const balanceValue = row['Book balance'] || row['Boeksaldo'] || row['Saldo'] || Object.values(row)[3] || Object.values(row)[4];
    
    return {
      date: parseBalanceDate(row['Date'] || row['Datum'] || Object.values(row)[0]),
      account: row['Account'] || row['Rekening'] || Object.values(row)[1],
      balance: parseAmount(balanceValue)
    };
  }).filter(b => !isNaN(b.balance) && b.date instanceof Date && !isNaN(b.date.getTime()));
};

export const parseBankCsv = (content) => {
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
    bom: true
  });

  const normalizedRows = [];

  for (const row of records) {
    let normalized = null;

    // Detect ING Main
    if (row['Amount (EUR)'] && row['Date'] && row['Date'].length === 8) {
      const amount = parseAmount(row['Amount (EUR)']);
      normalized = {
        date: parseIngMainDate(row['Date']),
        account: row['Account'],
        name_description: row['Name / Description'],
        counterparty: row['Counterparty'],
        amount: (row['Debit/credit'] === 'Debit' ? -1 : 1) * amount,
        currency: 'EUR',
        type: row['Transaction type'],
        time: extractTime(row['Notifications']),
        source: 'ing_main',
        external_id: `ing_main_${row['Date']}_${row['Amount (EUR)']}_${row['Resulting balance']}_${row['Name / Description']}`,
        metadata: {
          code: row['Code'],
          notifications: row['Notifications'],
          resulting_balance: row['Resulting balance'],
          tag: row['Tag']
        }
      };
    } 
    // Detect ING Savings
    else if (row['Amount'] && row['Date'] && row['Account name'] === 'savings account') {
      const amount = parseAmount(row['Amount']);
      normalized = {
        date: parseIngSavingsDate(row['Date']),
        account: row['Account'],
        name_description: row['Description'],
        counterparty: row['Counterparty'],
        amount: (row['Debit/credit'] === 'Debit' ? -1 : 1) * amount,
        currency: row['Currency'],
        type: row['Transaction type'],
        time: extractTime(row['Notifications']),
        source: 'ing_savings',
        external_id: `ing_savings_${row['Date']}_${row['Amount']}_${row['Resulting balance']}_${row['Description']}`,
        metadata: {
          account_name: row['Account name'],
          notifications: row['Notifications'],
          resulting_balance: row['Resulting balance']
        }
      };
    }

    if (normalized) {
      normalizedRows.push(normalized);
    }
  }

  return normalizedRows;
};
