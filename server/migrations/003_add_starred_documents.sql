-- Migration: Add starred documents
-- Description: Adds per-user starred document tracking
-- Created: 2026-01-28

CREATE TABLE IF NOT EXISTS starred_documents (
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (document_id, user_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_starred_documents_user ON starred_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_starred_documents_document ON starred_documents(document_id);

COMMENT ON TABLE starred_documents IS 'Tracks per-user starred documents';
COMMENT ON COLUMN starred_documents.user_id IS 'User that starred the document';
