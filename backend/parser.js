import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseDate } from 'date-fns';

const parseIngMainDate = (dateStr) => {
  const parsed = parseDate(dateStr, 'yyyyMMdd', new Date());
  // Adjust for potential timezone shift that moves it to previous day in UTC
  // We want the date to be 00:00:00 local time
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const parseIngSavingsDate = (dateStr) => {
  const parsed = parseDate(dateStr, 'yyyy-MM-dd', new Date());
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

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
  let parsed;
  if (dateStr.includes('-')) {
    // Check if it is yyyy-MM-dd or dd-MM-yyyy
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
    relax_column_count: true,
    quote: '"',
    ltrim: true,
    rtrim: true
  });

  return records.map(row => {
    // Find the balance column - it might be 'Book balance', 'Boeksaldo', 'Saldo',
    // or sometimes it's the 4th/5th column in a tab-separated file without headers
    const balanceValue = row['Book balance'] || row['Boeksaldo'] || row['Saldo'] || Object.values(row)[3] || Object.values(row)[4];
    const dateValue = row['Date'] || row['Datum'] || Object.values(row)[0];
    const accountValue = row['Account'] || row['Rekening'] || Object.values(row)[1];

    const parsedDate = parseBalanceDate(dateValue);
    const parsedBalance = parseAmount(balanceValue);

    return {
      date: parsedDate,
      account: accountValue,
      balance: parsedBalance
    };
  }).filter(b => !isNaN(b.balance) && b.date instanceof Date && !isNaN(b.date.getTime()));
};

export const parseBankCsv = (content) => {
  // Determine delimiter
  const delimiter = content.includes(';') ? ';' : ',';
  
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    bom: true,
    quote: '"'
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

    if (amountEUR && date) {
      const amount = parseAmount(amountEUR);
      const isDebit = debitCredit === 'Debit' || debitCredit === 'Af';
      
      let parsedDate;
      try {
        if (date.length === 8) {
          parsedDate = parseIngMainDate(date);
        } else {
          parsedDate = parseBalanceDate(date);
        }
      } catch (e) {
        console.error(`ERROR: Failed to parse date "${date}" in row:`, row);
        continue;
      }
      
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        console.error(`ERROR: Invalid date object for "${date}" in row:`, row);
        continue;
      }
      
      normalized = {
        date: parsedDate,
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
