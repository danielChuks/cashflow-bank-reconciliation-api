import pg from 'pg';

let pool: pg.Pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

export async function initDb() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS AccountingLedgerEntry (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      account VARCHAR(255) NOT NULL,
      debit NUMERIC DEFAULT 0,
      credit NUMERIC DEFAULT 0,
      party VARCHAR(255),
      note TEXT,
      bankaccount VARCHAR(255),
      reference VARCHAR(255),
      reconciled BOOLEAN DEFAULT FALSE,
      companyid INT NOT NULL DEFAULT 1,
      -- Helper columns to simplify queries
      cashflow_category VARCHAR(50) DEFAULT 'Operating', -- Operating, Investing, Financing
      is_cash_transaction BOOLEAN DEFAULT FALSE -- True for actual cash movements
    );
  `);

  // Add helper columns if they don't exist (for existing tables)
  await pool.query(`
    ALTER TABLE AccountingLedgerEntry 
    ADD COLUMN IF NOT EXISTS cashflow_category VARCHAR(50) DEFAULT 'Operating';
  `);
  
  await pool.query(`
    ALTER TABLE AccountingLedgerEntry 
    ADD COLUMN IF NOT EXISTS is_cash_transaction BOOLEAN DEFAULT FALSE;
  `);

  // Update existing data with helper column values
  await pool.query(`
    UPDATE AccountingLedgerEntry 
    SET 
      cashflow_category = CASE
        WHEN account IN ('Sales', 'Office Rent', 'Utilities Expense', 'Inventory', 'Bank Charges')
          THEN 'Operating'
        WHEN account IN ('Bank Loan') OR note ILIKE '%Capital Contribution%'
          THEN 'Financing'
        ELSE 'Investing'
      END,
      is_cash_transaction = CASE
        WHEN account = 'Cash' OR bankaccount IS NOT NULL
          THEN TRUE
        ELSE FALSE
      END
    WHERE cashflow_category = 'Operating' AND is_cash_transaction = FALSE;
  `);

  // Check if data exists
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM AccountingLedgerEntry'
  );
  if (parseInt(rows[0].count) === 0) {
    console.log('📥 Seeding sample data...');
    await pool.query(`
      INSERT INTO AccountingLedgerEntry  
      (date, account, debit, credit, party, note, bankaccount, reference, reconciled, companyid, cashflow_category, is_cash_transaction) 
      VALUES
      ('2025-01-02', 'Cash',              10000, 0, 'Investor',    'Capital Contribution',   'MainBank', 'DEP001', TRUE, 1, 'Financing', TRUE),
      ('2025-01-05', 'Office Rent',       0, 2000, 'Landlord Ltd.', 'January rent',           'MainBank', 'CHQ101', TRUE, 1, 'Operating', TRUE),
      ('2025-01-10', 'Inventory',         0, 3000, 'Supplier A',   'Purchase inventory',     'MainBank', 'CHQ102', FALSE, 1, 'Operating', TRUE),
      ('2025-01-15', 'Sales',             0, 8000, 'Customer B',   'Sales Invoice',          NULL, NULL, NULL, 1, 'Operating', FALSE),
      ('2025-01-16', 'Cash',              8000, 0, 'Customer B',   'Payment received',       'MainBank', 'DEP002', TRUE, 1, 'Operating', TRUE),
      ('2025-01-20', 'Utilities Expense', 0, 500, 'Power Co',      'Electricity bill',       'MainBank', 'CHQ103', TRUE, 1, 'Operating', TRUE),
      ('2025-01-25', 'Bank Loan',         0, 7000, 'BigBank',      'Loan received',          'MainBank', 'DEP003', TRUE, 1, 'Financing', TRUE),
      ('2025-01-26', 'Cash',              7000, 0, 'BigBank',      'Loan deposit',           'MainBank', 'DEP003', TRUE, 1, 'Financing', TRUE),
      ('2025-01-28', 'Bank Charges',      0, 500, 'BigBank',       'Monthly service charge', 'MainBank', 'CHQ104', FALSE, 1, 'Operating', TRUE);
    `);
  } else {
    console.log('✅ Database already seeded.');
  }
}

export { getPool as pool };
