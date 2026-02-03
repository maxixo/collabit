-- Migration: Create document_versions table
-- Description: Stores document version history for the history feature
-- Created: 2026-02-02

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  workspace_id TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_id
  ON document_versions(document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_document_versions_created_at
  ON document_versions(created_at DESC);

COMMENT ON TABLE document_versions IS 'Stores document version history for the history/restore feature';
COMMENT ON COLUMN document_versions.version_number IS 'Sequential version number for the document';
COMMENT ON COLUMN document_versions.content IS 'Full document content at this version';
COMMENT ON COLUMN document_versions.created_by IS 'User ID who created this version';