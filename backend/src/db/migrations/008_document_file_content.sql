ALTER TABLE document_validations
  ADD COLUMN file_content bytea;

CREATE INDEX document_validations_file_idx
  ON document_validations (id)
  WHERE file_content IS NOT NULL;
