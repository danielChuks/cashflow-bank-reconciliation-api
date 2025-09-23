import express, { Request, Response } from 'express';
import { pool } from '../database.js';

const router = express.Router();

interface CashflowRow {
  activity_type: string;
  inflows: string;
  outflows: string;
  net: string;
}

router.get('/cashflow', async (req: Request, res: Response) => {
  try {
    const { companyid, fromDate, toDate } = req.query;

    if (!companyid || !fromDate || !toDate) {
      return res.status(400).json({ error: 'Missing query params' });
    }

    // Simplified query using helper columns
    const query = `
      SELECT 
        cashflow_category as activity_type,
        SUM(CASE WHEN (debit - credit) > 0 THEN (debit - credit) ELSE 0 END) AS inflows,
        SUM(CASE WHEN (debit - credit) < 0 THEN ABS(debit - credit) ELSE 0 END) AS outflows,
        SUM(debit - credit) AS net
      FROM AccountingLedgerEntry
      WHERE companyid = $1
        AND date BETWEEN $2 AND $3
        AND is_cash_transaction = TRUE  -- Only actual cash movements
      GROUP BY cashflow_category;
    `;

    const result = await pool().query<CashflowRow>(query, [
      companyid,
      fromDate,
      toDate,
    ]);

    let response: Record<
      string,
      { inflows: number; outflows: number; net: number }
    > = {
      operating: { inflows: 0, outflows: 0, net: 0 },
      investing: { inflows: 0, outflows: 0, net: 0 },
      financing: { inflows: 0, outflows: 0, net: 0 },
    };

    result.rows.forEach((row) => {
      response[row.activity_type.toLowerCase()] = {
        inflows: Number(row.inflows),
        outflows: Number(row.outflows),
        net: Number(row.net),
      };
    });

    const netChange =
      response.operating.net + response.investing.net + response.financing.net;

    const closingBalanceQuery = `
      SELECT SUM(debit - credit) AS closing_balance
      FROM AccountingLedgerEntry
      WHERE companyid = $1
        AND date <= $2
        AND is_cash_transaction = TRUE
    `;
    const closingRes = await pool().query<{ closing_balance: string }>(
      closingBalanceQuery,
      [companyid, toDate]
    );
    const closingBalance = Number(closingRes.rows[0]?.closing_balance || 0);

    res.json({
      ...response,
      netChange,
      closingBalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
