ALTER TABLE blind_candidates
  DROP CONSTRAINT IF EXISTS blind_candidates_request_id_document_number_key,
  ADD COLUMN IF NOT EXISTS privacy_notice_version varchar(80),
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD CONSTRAINT blind_candidate_privacy_consent_pair_check
    CHECK ((privacy_notice_version IS NULL) = (privacy_consent_at IS NULL));

CREATE UNIQUE INDEX blind_candidates_official_request_document_idx
  ON blind_candidates (request_id, document_number)
  WHERE is_demo = false;
