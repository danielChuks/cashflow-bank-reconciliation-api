import express, { Request, Response } from "express";
import pg from "pg";

const router = express.Router();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

interface ReconRow {
  reference: string;
  account: string;
  amount: string;
  note: string;
}

router.get("/reconciliation", async (req: Request, res: Response) => {
  try {
    const { companyid, bankaccount } = req.query;

    if (!companyid || !bankaccount) {
      return res.status(400).json({ error: "Missing query params" });
    }

    // Ledger balance
    const ledgerRes = await pool.query<{ ledger_balance: string }>(
      `SELECT SUM(debit - credit) AS ledger_balance
       FROM AccountingLedgerEntry
       WHERE companyid = $1 AND bankaccount = $2`,
      [companyid, bankaccount]
    );
    const ledgerBalance = Number(ledgerRes.rows[0]?.ledger_balance || 0);

    // Bank statement balance (hardcoded for assignment)
    const bankBalance = 19000;

    // Unreconciled transactions
    const reconcilingRes = await pool.query<ReconRow>(
      `SELECT reference, account, (debit - credit) AS amount, note
       FROM AccountingLedgerEntry
       WHERE companyid = $1 AND bankaccount = $2 AND reconciled = FALSE`,
      [companyid, bankaccount]
    );

    const reconcilingItems = reconcilingRes.rows.map((row) => ({
      reference: row.reference,
      amount: Number(row.amount),
      type: row.note.includes("Bank charge")
        ? "bank charge not recorded"
        : "outstanding cheque",
    }));

    const adjustedBalance =
      bankBalance + reconcilingItems.reduce((acc, r) => acc + r.amount, 0);

    res.json({
      ledgerBalance,
      bankBalance,
      reconcilingItems,
      adjustedBalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;