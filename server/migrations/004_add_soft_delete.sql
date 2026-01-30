-- Migration: Add soft delete support
-- Description: Adds deleted_at column to documents for trash workflows
-- Created: 2026-01-30

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);

COMMENT ON COLUMN documents.deleted_at IS 'Timestamp when the document was moved to trash';
