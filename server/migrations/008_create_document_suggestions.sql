-- Migration: Create document_suggestions table
-- Description: Stores track-changes suggestions for collaborative review

CREATE TABLE IF NOT EXISTS document_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  suggestion_type VARCHAR(20) NOT NULL CHECK (suggestion_type IN ('insert', 'delete', 'replace', 'format')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  original_text TEXT,
  suggested_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_document_suggestions_document
  ON document_suggestions(document_id, workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_suggestions_author
  ON document_suggestions(author_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_suggestions_status
  ON document_suggestions(status, created_at DESC);
