CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX password_reset_requests_open_user_idx
  ON password_reset_requests (user_id)
  WHERE resolved_at IS NULL;

CREATE INDEX password_reset_requests_open_created_idx
  ON password_reset_requests (created_at DESC)
  WHERE resolved_at IS NULL;
