import { Pool } from "pg";
import { env } from "./env.js";

const dbConfig = env.databaseUrl ? { connectionString: env.databaseUrl } : {};

export const db = new Pool(dbConfig);

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await db.query("SELECT 1");
    
    // Auth and document tables must be initialized before accepting requests.
    const requiredTables = ["user", "session", "account", "verification", "documents", "document_members"];
    const { rows: tables } = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    `, [requiredTables]);
    
    const tableNames = tables.map((row: { table_name: string }) => row.table_name);
    
    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        throw new Error(`Required table '${table}' does not exist. Run migrations first.`);
      }
    }
    
    return true;
  } catch (error) {
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
