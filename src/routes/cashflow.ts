import express, { Request, Response } from "express";
import pg from "pg";

const router = express.Router();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

interface CashflowRow {
  activity_type: string;
  inflows: string;
  outflows: string;
  net: string;
}

router.get("/cashflow", async (req: Request, res: Response) => {
  try {
    const { companyid, fromDate, toDate } = req.query;

    if (!companyid || !fromDate || !toDate) {
      return res.status(400).json({ error: "Missing query params" });
    }

    const query = `
      WITH cash_flows AS (
        SELECT 
          date,
          account,
          debit,
          credit,
          bankaccount,
          reference,
          companyid,
          CASE
            WHEN account IN ('Sales', 'Office Rent', 'Utilities Expense', 'Inventory', 'Bank Charges')
              THEN 'Operating'
            WHEN account IN ('Bank Loan') OR note ILIKE '%Capital Contribution%'
              THEN 'Financing'
            ELSE 'Investing'
          END AS activity_type,
          (debit - credit) AS net_cash
        FROM AccountingLedgerEntry
        WHERE companyid = $1
          AND date BETWEEN $2 AND $3
      )
      SELECT 
        activity_type,
        SUM(CASE WHEN net_cash > 0 THEN net_cash ELSE 0 END) AS inflows,
        SUM(CASE WHEN net_cash < 0 THEN ABS(net_cash) ELSE 0 END) AS outflows,
        SUM(net_cash) AS net
      FROM cash_flows
      GROUP BY activity_type;
    `;

    const result = await pool.query<CashflowRow>(query, [
      companyid,
      fromDate,
      toDate,
    ]);

    let response: Record<string, { inflows: number; outflows: number; net: number }> = {
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
    `;
    const closingRes = await pool.query<{ closing_balance: string }>(
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
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;