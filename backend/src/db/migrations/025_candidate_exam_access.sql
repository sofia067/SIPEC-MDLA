ALTER TABLE blind_candidates
  ADD COLUMN exam_password_hash text,
  ADD COLUMN exam_password_issued_at timestamptz,
  ADD COLUMN exam_started_at timestamptz,
  ADD COLUMN exam_answer_draft jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT blind_candidate_exam_draft_array_check
    CHECK (jsonb_typeof(exam_answer_draft) = 'array');

CREATE TABLE blind_candidate_sessions (
  token_hash char(64) PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES blind_candidates(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blind_candidate_sessions_expiry_idx
  ON blind_candidate_sessions (expires_at);
