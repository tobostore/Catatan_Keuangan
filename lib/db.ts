import mysql from 'mysql2/promise';

function readEnv(name: string, fallback: string) {
  return (process.env[name] ?? fallback).trim()
}

const pool = mysql.createPool({
  host: readEnv("DB_HOST", "109.111.53.58"),
  port: Number(readEnv("DB_PORT", "33310")),
  user: readEnv("DB_USER", "Catatan_Pengeluaran"),
  password: readEnv("DB_PASSWORD", "Nub132$132"),
  database: readEnv("DB_NAME", "catatan_pengeluaran"),
  waitForConnections: true,
  connectionLimit: 10,
})

function isTransientDbError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
  return code === "ECONNRESET" || code === "PROTOCOL_CONNECTION_LOST" || code === "ETIMEDOUT"
}

export async function query<
  T extends
    | mysql.RowDataPacket[][]
    | mysql.RowDataPacket[]
    | mysql.ResultSetHeader
    | mysql.OkPacket
    | mysql.OkPacket[],
>(sql: string, params: unknown[] = []) {
  try {
    const [rows] = await pool.execute<T>(sql, params)
    return rows
  } catch (error) {
    if (isTransientDbError(error)) {
      const [rows] = await pool.execute<T>(sql, params)
      return rows
    }

    throw error
  }
}

export default pool