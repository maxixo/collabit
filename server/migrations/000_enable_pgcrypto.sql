-- Migration: Enable pgcrypto extension
-- Description: Required for gen_random_uuid() defaults used by UUID columns
-- Created: 2026-02-09

CREATE EXTENSION IF NOT EXISTS pgcrypto;
