-- Migration: Create share_tokens table
-- Description: Adds share token support for document sharing
-- Created: 2026-01-31

CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  token UUID NOT NULL,
  document_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('owner', 'editor', 'viewer')),
  expiration_date TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_document ON share_tokens(document_id);
