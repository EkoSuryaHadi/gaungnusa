import duckdb from "duckdb";

const globalForDuckDB = globalThis as unknown as {
  dbInstance: duckdb.Database | null;
  initPromise: Promise<duckdb.Database> | null;
  isInitialized: boolean;
};

if (!globalForDuckDB.dbInstance) {
  globalForDuckDB.dbInstance = null;
}
if (!globalForDuckDB.initPromise) {
  globalForDuckDB.initPromise = null;
}
if (globalForDuckDB.isInitialized === undefined) {
  globalForDuckDB.isInitialized = false;
}

export function getDuckDB(): Promise<duckdb.Database> {
  if (globalForDuckDB.initPromise) return globalForDuckDB.initPromise;

  globalForDuckDB.initPromise = new Promise((resolve, reject) => {
    try {
      console.log("[DuckDB] Initializing in-memory instance...");
      const db = new duckdb.Database(":memory:");
      globalForDuckDB.dbInstance = db;

      db.all("INSTALL postgres; LOAD postgres;", (err) => {
        if (err) {
          console.error("[DuckDB] Failed to load postgres extension:", err);
          globalForDuckDB.initPromise = null;
          return reject(err);
        }

        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
          globalForDuckDB.initPromise = null;
          return reject(new Error("DATABASE_URL is not defined in environment variables."));
        }

        try {
          const url = new URL(dbUrl);
          const username = decodeURIComponent(url.username);
          const password = decodeURIComponent(url.password);
          const host = url.hostname;
          const port = url.port || "5432";
          const dbname = url.pathname.slice(1).split("?")[0]; // remove query params if any

          const connectionString = `dbname=${dbname} user=${username} password=${password} host=${host} port=${port}`;
          
          console.log(`[DuckDB] Attaching PostgreSQL database "${dbname}" at ${host}:${port}...`);
          db.all(`ATTACH '${connectionString}' AS pg (TYPE postgres);`, (err2) => {
            if (err2) {
              console.error("[DuckDB] Failed to attach PostgreSQL database:", err2);
              globalForDuckDB.initPromise = null;
              return reject(err2);
            }

            db.all("USE pg;", (err3) => {
              if (err3) {
                console.error("[DuckDB] Failed to set default catalog to pg:", err3);
                globalForDuckDB.initPromise = null;
                return reject(err3);
              }

              console.log("[DuckDB] Successfully initialized and attached to PostgreSQL.");
              globalForDuckDB.isInitialized = true;
              resolve(db);
            });
          });
        } catch (parseErr) {
          console.error("[DuckDB] Failed to parse DATABASE_URL:", parseErr);
          globalForDuckDB.initPromise = null;
          return reject(parseErr);
        }
      });
    } catch (setupErr) {
      console.error("[DuckDB] Unexpected error during setup:", setupErr);
      globalForDuckDB.initPromise = null;
      reject(setupErr);
    }
  });

  return globalForDuckDB.initPromise;
}

export function queryDuckDB(sql: string): Promise<any[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDuckDB();
      db.all(sql, (err, rows) => {
        if (err) {
          console.error(`[DuckDB] Query error: "${sql}"`, err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
