import express, { Application } from 'express';
import dotenv from 'dotenv';
import { pool, initDb } from './database.js';
import cashflowRoutes from './routes/cashflow.js';
import reconciliationRoutes from './routes/reconciliation.js';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 4000;

// Test database connection
async function testDatabaseConnection() {
  try {
    const client = await pool().connect();
    console.log('✅ Database connected successfully!');

    // Test query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('📅 Database time:', result.rows[0].current_time);

    client.release();
  } catch (err) {
    console.error('Database connection failed:', (err as Error).message);
    process.exit(1);
  }
}

app.use(express.json());

// Routes
app.use('/api', cashflowRoutes);
app.use('/api', reconciliationRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool().connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: (err as Error).message,
    });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  await testDatabaseConnection();
  await initDb();
});
