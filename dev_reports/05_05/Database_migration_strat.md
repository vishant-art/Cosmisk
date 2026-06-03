> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 migration strategy; numbers/preconditions stale. Superseded by `19_05/Database_migration_strat.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# COSMISK Database Migration Strategy

## Overview
This document outlines the architectural decisions for migrating the COSMISK database from a fragmented SQLite setup to a unified, production-ready PostgreSQL environment.

---

## 1. JSON Data Type Strategy: Hybrid Approach

**Decision:** Use `jsonb` for queryable metadata and standard `json` (or `text`) for large, read-only payload blobs.

**Reasoning:**
* `jsonb` parses data on insertion to allow binary indexing (GIN indexes). This is perfect for fields like `users.goals` or `brand_context` where we need to search inside the JSON.
* For massive payloads like `audits.full_output` or `reports.data` that are only ever read/written as complete documents, the `jsonb` parsing overhead provides no value and slows down writes.

**Impact on Design:**
Optimizes database write performance for heavy AI outputs while maintaining instant searchability for user preferences and metadata.

---

## 2. Deletion Strategy: Core Soft Deletes + Leaf Cascades

**Decision:**
Implement `deleted_at` (soft deletes) for core business entities, and `ON DELETE CASCADE` for transient/regeneratable leaf data.

**Reasoning:**
* **Soft Deletes:** Applied to `users`, `brands`, `subscriptions`, `creative_sprints`, and `cost_ledger`. A blanket cascade would risk catastrophic, unrecoverable data loss (e.g., deleting a user wipes their billing ledger). Soft deletes protect compliance and recovery.
* **Cascades:** Applied to `agent_runs`, `dna_cache`, and `studio_outputs`. This prevents database bloat from orphaned, low-value data.

**Impact on Design:**
Requires the application layer to append `WHERE deleted_at IS NULL` to read queries for core entities, but guarantees absolute safety for billing and audit trails.

---

## 3. Schema Unification: Two-Step Migration

**Decision:**
Consolidate the fragmented schema into a single Drizzle SQLite schema *first*, test it, and *then* swap the dialect to PostgreSQL.

**Reasoning:**
Currently, 40 tables are scattered across 4 files (some lazy-loaded, some one-off scripts). Unifying the schema and changing the database engine simultaneously introduces too many variables. If data drops, debugging whether it was an engine mismatch or a missing table is difficult.

**Impact on Design:**
Forces a disciplined, testable progression. Step 1 proves the unified schema is complete. Step 2 proves the Postgres types (enums, arrays, jsonb) work.

---

## 4. Indexing & Type Safety (Priority 1.1)

**Decision:**
Apply missing indexes to hot paths immediately during the unification phase and promote string constants to Enums.

**Reasoning:**
The audit revealed 13 critical missing indexes (e.g., `cost_ledger(user_id, created_at)` and `subscriptions(user_id)`). Missing these on Postgres will cause severe CPU spiking under load.

**Impact on Design:**
Dramatically speeds up dashboard queries and background cron jobs. Shrinks row sizes by converting 25+ string columns to strict PostgreSQL `ENUM` types.