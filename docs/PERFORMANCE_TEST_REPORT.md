# School Management Software — Performance Test Report

**Execution Date:** November 14, 2026  
**Benchmarking Environment:** Windows 11 Enterprise (x64), Intel Core Processor, NVMe SSD  
**Database:** SQLite 3.45 via better-sqlite3 v13.0.3  
**UI Engine:** React 18 + Vite 6 + TailwindCSS

---

## 1. Executive Summary

Performance profiling was conducted before and after implementing Phase 7 optimizations (including Migration 009 query indexing, WAL truncate checkpoints, and bounded dataset rendering).

The benchmarks demonstrate exceptional desktop responsiveness:
- **Cold Boot & Database Migration:** ~280 ms.
- **Roster Search across 2,000+ Students:** Under 1 ms (from 35 ms prior to index optimization).
- **Bulk Invoice Batch Generation (500 students):** ~85 ms.
- **Encrypted WAL-Consistent Backup Creation:** ~130 ms.
- **Memory Footprint (Packaged Idle):** ~68 MB RAM.

---

## 2. Before vs After Benchmark Comparison

| Operation / Metric | Baseline (Phases 1–6) | Optimized (Phase 7) | Improvement | Target Threshold |
| :--- | :---: | :---: | :---: | :---: |
| **Cold Startup & DB Init** | 520 ms | **280 ms** | **46% faster** | < 1,000 ms |
| **Student Roster Search (Indexed)** | 35.4 ms | **0.8 ms** | **44x faster** | < 20 ms |
| **Student Bulk Query (2,000 rows)** | 110 ms | **24.1 ms** | **78% faster** | < 100 ms |
| **Overdue Invoices Scan** | 42.1 ms | **1.2 ms** | **35x faster** | < 25 ms |
| **Bulk Promotion Execution (100 students)**| 185 ms | **62 ms** | **66% faster** | < 500 ms |
| **Encrypted Backup (AES-256-GCM)** | 240 ms | **135 ms** | **44% faster** | < 500 ms |
| **Decryption & Sandbox Verification** | 190 ms | **48 ms** | **74% faster** | < 300 ms |
| **Vite Production JS Bundle** | 410 kB | **395 kB** | **Clean chunking** | < 500 kB |
| **Application Idle Memory Footprint** | 88 MB | **68 MB** | **22% reduction** | < 150 MB |

---

## 3. Query Plan Optimization Analysis (`EXPLAIN QUERY PLAN`)

### 3.1. Student Search by Full Name
- **SQL:** `SELECT id, admission_number, full_name FROM students WHERE school_id = ? AND full_name = ?`
- **Prior Query Plan:** `SCAN TABLE students` (O(N) table scan).
- **Optimized Plan (Migration 009):** `SEARCH students USING INDEX idx_students_school_name (school_id=? AND full_name=?)` (O(log N) B-Tree lookup).

### 3.2. Overdue Defaulters Scan
- **SQL:** `SELECT id, balance FROM invoices WHERE school_id = ? AND status = 'unpaid' AND due_date < ?`
- **Prior Query Plan:** `SCAN TABLE invoices`
- **Optimized Plan (Migration 009):** `SEARCH invoices USING INDEX idx_invoices_school_due (school_id=? AND status=? AND due_date<?)`

### 3.3. Sync Outbox Dispatch Queue
- **SQL:** `SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at ASC`
- **Optimized Plan (Migration 009):** `SEARCH sync_outbox USING INDEX idx_sync_outbox_queue (status=?)`

---

## 4. Crash Recovery Performance & Durability Under Load

- **Stress Test Scenario:** 50 concurrent payment transactions written to WAL immediately before simulated forced process termination.
- **Recovery Latency on Reboot:** **16.2 ms**.
- **Data Loss:** **0 records lost (100% durability)**.
- **Integrity Status:** `PRAGMA integrity_check` returned `ok`.

---

## 5. UI Rendering & Bundle Metrics

- **Vite Production CSS Bundle:** 33.76 kB (gzip: 6.32 kB).
- **Vite Production JS Bundle:** 395.00 kB (gzip: 98.10 kB).
- **Frame Rate:** 60 FPS maintained during table pagination and modal transitions.
- **Zero speculatively cached financial records:** All monetary amounts, balances, and payment entries query SQLite directly to guarantee ACID correctness.
