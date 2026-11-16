ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS anonymization_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ocr_confidence_threshold integer NOT NULL DEFAULT 85
    CHECK (ocr_confidence_threshold BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS institutional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_data jsonb NOT NULL DEFAULT '{}'::jsonb;
