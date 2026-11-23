ALTER TABLE document_snapshots ADD COLUMN revision INTEGER;
CREATE TABLE legacy_document_snapshots AS TABLE document_snapshots;
