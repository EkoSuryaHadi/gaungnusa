# Gaung Data Lakehouse — Workflow Lengkap

> **Version:** 2.4 | **Last updated:** 9 July 2026
> **Domain:** https://gaung.ekosuryahadi.web.id
> **User:** eko@nusa2.io / test123456

---

## 1. Arsitektur

```
Browser → Nginx (:443) → Next.js (:3000) → API Routes
                              ↓                    ↓
                         Turbopack Dev       Python ETL
                         (auto-compile)      (/usr/bin/python3)
                                                  ↓
                         PostgreSQL (:5433) ← Silver Engine
                         ├── bronze.*           (pandas modules)
                         ├── silver.*
                         └── gold.*
```

---

## 2. Data Flow: Upload → Bronze → Silver → Gold

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  Upload CSV │ ──→ │ Bronze Layer │ ──→ │ Silver Layer │ ──→ │ Gold Layer  │
│  (Sources)  │     │ (Raw data)   │     │ (Clean+Valid)│     │ (Aggregated)│
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
                           │                      │                    │
                     Auto-ingest           Quick Process         Pipeline
                     Pandas parse          AI Quality Engine     AGGREGATE step
```

---

## 3. Fitur Utama (v2.4)

### 3.1 Upload Data
1. Buka **Sources** → **New Source** → Upload CSV
2. Auto-detect delimiter, encoding, schema
3. Auto-create pipeline + Bronze → Silver Quick Process

### 3.2 Silver AI Quality Engine
**Modules (berjalan otomatis saat Quick Process):**
| Step | Fungsi |
|---|---|
| Profiling | Statistik kolom, null%, duplicate% |
| DataType | Auto-detect + cast tipe data |
| Timestamp | Parse mixed format, normalize ke UTC, infer WITA (+08:00) |
| Missing | **Interpolasi per-device** (v2.4) — fill null dengan interpolasi dalam group device_id |
| Classify | Auto-detect domain: iot/finance/sales/erp/hr |
| Validate | YAML rules: range, unique, enum, regex |
| Score | DQI 0-100 (completeness, validity, consistency, uniqueness) |

**Quality Columns di Silver:**
- `_missing_count` — jumlah null per row
- `_outlier_count` — jumlah outlier per row
- `_timestamp_violation` — masalah timestamp
- `_humidity_pct_violation` — pelanggaran rule humidity

### 3.3 Edit Null Values (v2.4)
1. Buka Lakehouse → Silver → table
2. Klik **🔶 Edit Null Values** (muncul jika ada `_missing_count > 0`)
3. Dialog tampilkan row + kolom yang null
4. Isi nilai → **Simpan** → PATCH API → UPDATE DB via composite key (device_id + timestamp)
5. Auto reload halaman

### 3.4 Gold Layer
1. Buka **Pipelines** → pilih pipeline Gold
2. SOURCE dari Silver table → AGGREGATE → OUTPUT ke Gold
3. Multi-output support: 1 pipeline bisa output ke beberapa Gold table

**Contoh Gold IoT:**
- `iot_device_summary` — avg temp/humidity/vibration per device
- `iot_device_quality_rank` — ranking device by data quality

### 3.5 Dashboard Builder
1. Buka **Dashboards** → **New Dashboard**
2. Drag & drop widget: KPI, Bar, Line, Pie, Area, Table
3. Pilih data source (layer + table), aggregate, axes
4. Share via public link

---

## 4. Bug Fixes (v2.4)

| Bug | Root Cause | Fix |
|---|---|---|
| `_device_id_violation: duplicate_value` semua row IoT | `iot.yaml` → `device_id: {unique: true}` | Hapus unique rule |
| Timestamp tampil UTC `.000Z` | Frontend `String()` raw | `formatCellValue()` → WITA |
| Interpolasi null antar device campur | `interpolate()` tanpa groupby | Group by `device_id` dulu |
| Dashboard count gak filter tenant | Query tanpa `tenantId` | Tambah `tenantFilter` |
| Login dari domain gagal | CORS dev origins | `allowedDevOrigins` di next.config |
| `.next` root-owned gak bisa build | Previous build as root | Pakai Turbopack dev |
| PATCH API row identification gagal | `OFFSET` tanpa `ORDER BY` | Composite key `(device_id, timestamp)` |

---

## 5. Cara Akses

### Gaung App
- **URL:** https://gaung.ekosuryahadi.web.id
- **Login:** eko@nusa2.io / test123456

### Prisma Studio (Database Browser)
- **URL:** http://206.237.98.72:5555
- **Tabel:** Bronze, Silver, Gold, User, Tenant, Pipeline, dll

### Database Direct
```bash
ssh ubuntu@206.237.98.72
psql -h localhost -p 5433 -U gaung -d gaung
```

---

## 6. Server Management

```bash
# Cek status
ss -tlnp | grep 3000

# Restart dev server
kill $(lsof -t -i:3000)
cd /home/ubuntu/gaung && bash dev-keeper.sh &

# Cek log
tail -f /proc/$(pgrep -f "next dev")/fd/1

# Run ETL manually
cd /home/ubuntu/gaung
/usr/bin/python3 worker/etl_runner.py /tmp/gaung_pipeline_*.json
```

---

## 7. Quality Rules (YAML)

| File | Domain | Rules |
|---|---|---|
| `worker/silver/rules/iot.yaml` | IoT/Sensor | temp -50..300, humidity 0..100, battery 0..100, rssi -120..0 |
| `worker/silver/rules/finance.yaml` | Finance | debit/kredit range, enum values |
| `worker/silver/rules/generic.yaml` | General | Basic type + range rules |

---

## 8. Development Workflow

```
1. Edit code → Turbopack auto-compile → Refresh browser
2. Python changes → langsung berlaku (fresh subprocess per run)
3. Next.js API changes → auto recompile (Turbopack)
4. No need to build — dev server handles everything
```

> ⚠️ `.next` directory root-owned → jangan `npm run build`. 
> Gunakan `npm run dev` (Turbopack) untuk development & production.

---

## 9. PRD Updates

Changelog v2.4:
- §12.7: Missing module interpolasi per-device
- §12.8: Edit Null Values dialog
- §12.9: IoT validation fix
- Phase 4: +3 items selesai
