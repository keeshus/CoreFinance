/**
 * Formats a Date object to YYYY-MM-DD string
 */
export const toDateStr = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Validates transaction movements against a daily balance map.
 * 
 * @param {Array} sortedTxs - Transactions sorted by date
 * @param {Object} dailyBalanceMap - Map of date string to reported balance
 * @param {number} startingBalance - The balance on the day before the first transaction
 * @returns {Object} result - { isValid: boolean, discrepancies: Array, currentBalance: number }
 */
export const validateBalanceMovements = (sortedTxs, dailyBalanceMap, startingBalance) => {
  const discrepancies = [];
  const txsByDay = sortedTxs.reduce((acc, t) => {
    const dStr = toDateStr(t.date);
    acc[dStr] = (acc[dStr] || 0) + t.amount;
    return acc;
  }, {});

  const earliestTxDate = sortedTxs[0].date;
  const latestTxDate = sortedTxs[sortedTxs.length - 1].date;
  const latestTxDateStr = toDateStr(latestTxDate);

  const txDays = [...new Set(sortedTxs.map(t => toDateStr(t.date)))].sort();
  const balanceDays = Object.keys(dailyBalanceMap)
    .filter(dStr => dStr <= latestTxDateStr)
    .sort();
  const allDays = [...new Set([...txDays, ...balanceDays])].sort();

  let currentBalance = startingBalance;

  for (const dayStr of allDays) {
    const dayChange = txsByDay[dayStr] || 0;
    currentBalance = Math.round((currentBalance + dayChange) * 100) / 100;
    
    const reportedBalance = dailyBalanceMap[dayStr];
    if (reportedBalance !== undefined) {
      const reportedBalanceRounded = Math.round(reportedBalance * 100) / 100;
      if (Math.abs(currentBalance - reportedBalanceRounded) > 0.001) {
        discrepancies.push({
          date: dayStr,
          expected: reportedBalance,
          calculated: currentBalance,
          diff: reportedBalance - currentBalance
        });
      }
    }
  }

  return {
    isValid: discrepancies.length === 0,
    discrepancies,
    finalBalance: currentBalance
  };
};
