# Spec: Python ETL Worker Dependencies Resolution

**Date:** 2026-07-10  
**Author:** Antigravity AI  
**Status:** Approved  

---

## 1. Overview & Problem Statement

The Gaung platform relies on Next.js 16 for the web interface and API routing, but offloads all heavy analytical processing, external database introspection, and API fetching to background Python scripts (`worker/etl_runner.py`, `worker/api_fetcher.py`, and `worker/db_fetcher.py`).

**Problem:**  
The host system did not have the required Python modules installed, which caused background processes spawned by the Next.js API routes to fail with `ModuleNotFoundError` (`pandas`, `requests`, etc.), rendering the ETL pipeline and synchronization features inoperable.

---

## 2. Root Cause Analysis

We inspected the imports of the three worker scripts and identified the following required packages that were missing:
1. `requests` — utilized by `api_fetcher.py` for API data ingestion.
2. `pandas` — utilized by all three workers for data manipulation and DataFrame loading.
3. `sqlalchemy` — utilized by `etl_runner.py` and `db_fetcher.py` for database connection pooling and raw SQL execution.
4. `cryptography` — utilized by `crypto_utils.py` for decrypting stored credentials (Fernet).
5. `psycopg2-binary` — required for PostgreSQL connection capabilities.
6. `pymysql` — required for MySQL connection capabilities.
7. `openpyxl` — required by Pandas to parse uploaded Excel files (`.xlsx`).

---

## 3. Resolution & Installed Dependencies

We executed a system-wide user package installation to resolve these missing dependencies:
```bash
pip install pandas requests sqlalchemy cryptography psycopg2-binary pymysql openpyxl
```

All packages were successfully downloaded and installed.

---

## 4. Verification & Testing

We verified the resolution by:
1. Running the Next.js production build (`npm run build`), which compiled successfully in `9.2s` with TypeScript type checking passing cleanly in `8.8s`.
2. Running syntax/import verification on the Python scripts:
   - `python worker/api_fetcher.py`
   - `python worker/etl_runner.py`
   Both executed without import failures and printed their usage instructions as expected.
