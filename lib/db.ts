import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || "10.20.25.8",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "Harr1",
  password: process.env.DB_PASSWORD || "gmdp@2025",
  database: process.env.DB_NAME || "catatan_pengeluaran",
  waitForConnections: true,
  connectionLimit: 10,
})

export async function query<
  T extends
    | mysql.RowDataPacket[][]
    | mysql.RowDataPacket[]
    | mysql.ResultSetHeader
    | mysql.OkPacket
    | mysql.OkPacket[],
>(sql: string, params: unknown[] = []) {
  const [rows] = await pool.execute<T>(sql, params)
  return rows
}

export default pool