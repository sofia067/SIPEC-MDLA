ALTER TABLE coverage_requests ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE coverage_requests ADD COLUMN IF NOT EXISTS external_source_code text;

CREATE UNIQUE INDEX IF NOT EXISTS coverage_requests_external_source_idx
  ON coverage_requests (external_source, external_source_code)
  WHERE external_source IS NOT NULL AND external_source_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS external_convocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text NOT NULL UNIQUE,
  title text NOT NULL,
  source_url text,
  published_at timestamptz,
  closes_at timestamptz,
  profile_id uuid REFERENCES position_profiles(id) ON DELETE SET NULL,
  match_score numeric(5, 4),
  status text NOT NULL DEFAULT 'unmatched',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_convocations_status_synced_idx
  ON external_convocations (status, last_synced_at DESC);
