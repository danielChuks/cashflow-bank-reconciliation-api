import express, { Application } from "express";
import dotenv from "dotenv";
import cashflowRoutes from "./routes/cashflow.js";
import reconciliationRoutes from "./routes/reconciliation.js";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Routes
app.use("/api", cashflowRoutes);
app.use("/api", reconciliationRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});