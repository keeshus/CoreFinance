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

const parseBalanceDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr.includes('-')) {
    return parseDate(dateStr, 'dd-MM-yyyy', new Date());
  }
  return parseDate(dateStr, 'yyyy-MM-dd', new Date());
};

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

    // Detect ING Main (Dutch or English headers)
    const date = row['Date'] || row['Datum'];
    const amountEUR = row['Amount (EUR)'] || row['Bedrag (EUR)'];
    const account = row['Account'] || row['Rekening'];
    const nameDescription = row['Name / Description'] || row['Naam / Omschrijving'];
    const counterparty = row['Counterparty'] || row['Tegenrekening'];
    const debitCredit = row['Debit/credit'] || row['Af Bij'];
    const transactionType = row['Transaction type'] || row['Mutatiesoort'];
    const notifications = row['Notifications'] || row['Mededelingen'];
    const resultingBalance = row['Resulting balance'] || row['Saldo na mutatie'];
    const tag = row['Tag'];

    if (amountEUR && date && date.length === 8) {
      const amount = parseAmount(amountEUR);
      const isDebit = debitCredit === 'Debit' || debitCredit === 'Af';
      
      normalized = {
        date: parseIngMainDate(date),
        account: account,
        name_description: nameDescription,
        counterparty: counterparty,
        amount: (isDebit ? -1 : 1) * amount,
        currency: 'EUR',
        type: transactionType,
        time: extractTime(notifications),
        source: 'ing_main',
        external_id: `ing_main_${date}_${amountEUR}_${resultingBalance}_${nameDescription}`,
        metadata: {
          code: row['Code'],
          notifications: notifications,
          resulting_balance: resultingBalance,
          tag: tag
        }
      };
    } 
    // Detect ING Savings
    else if ((row['Amount'] || row['Bedrag']) && date && (row['Account name'] === 'savings account' || row['Naam rekening'] === 'Spaarrekening')) {
      const amountStr = row['Amount'] || row['Bedrag'];
      const amount = parseAmount(amountStr);
      const isDebit = debitCredit === 'Debit' || debitCredit === 'Af';

      normalized = {
        date: parseIngSavingsDate(date),
        account: account,
        name_description: row['Description'] || row['Omschrijving'],
        counterparty: counterparty,
        amount: (isDebit ? -1 : 1) * amount,
        currency: row['Currency'] || row['Munteenheid'] || 'EUR',
        type: transactionType,
        time: extractTime(notifications),
        source: 'ing_savings',
        external_id: `ing_savings_${date}_${amountStr}_${resultingBalance}_${row['Description'] || row['Omschrijving']}`,
        metadata: {
          account_name: row['Account name'] || row['Naam rekening'],
          notifications: notifications,
          resulting_balance: resultingBalance
        }
      };
    }

    if (normalized) {
      normalizedRows.push(normalized);
    }
  }

  return normalizedRows;
};
