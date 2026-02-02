-- Create table to track document change events for collaboration history
CREATE TABLE IF NOT EXISTS document_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('insert', 'delete', 'update', 'format', 'title')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  applied BOOLEAN DEFAULT FALSE,
  workspace_id TEXT NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_change_events_doc ON document_change_events(document_id, created_at DESC);
CREATE INDEX idx_change_events_user ON document_change_events(user_id, created_at DESC);
CREATE INDEX idx_change_events_applied ON document_change_events(applied, created_at DESC);
CREATE INDEX idx_change_events_workspace ON document_change_events(workspace_id, document_id);