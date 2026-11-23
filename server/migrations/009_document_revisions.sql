ALTER TABLE documents ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);

CREATE TABLE document_mutations (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  mutation_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, actor_id, mutation_id)
);
