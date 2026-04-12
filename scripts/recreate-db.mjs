import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function loadEnvLocal(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildStatements(sqlText) {
  return sqlText
    .split(/;\s*(?:\r?\n|$)/g)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

async function run() {
  const projectRoot = process.cwd();
  loadEnvLocal(path.join(projectRoot, ".env.local"));

  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "catatan_pengeluaran";

  const sqlPath = path.join(projectRoot, "database", "recreate_catatan_pengeluaran.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }

  let sqlText = fs.readFileSync(sqlPath, "utf8");
  sqlText = sqlText.replace(/catatan_pengeluaran/g, database);

  const statements = buildStatements(sqlText);
  if (statements.length === 0) {
    throw new Error("No SQL statements to run.");
  }

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: false,
  });

  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log(`Database '${database}' recreated and seeded successfully.`);
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Failed to recreate database:", error.message);
  process.exitCode = 1;
});
