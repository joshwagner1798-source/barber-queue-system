-- =============================================================================
-- Add note_short and payload_json to provider_blocks
-- note_short: pre-computed 40-char display label (always non-null)
-- payload_json: raw Acuity block payload for debugging
-- =============================================================================

ALTER TABLE provider_blocks
  ADD COLUMN IF NOT EXISTS note_short   TEXT NOT NULL DEFAULT 'Blocked',
  ADD COLUMN IF NOT EXISTS payload_json JSONB;

-- Backfill note_short from the existing `note` column for rows already present
UPDATE provider_blocks
SET note_short = CASE
  WHEN note IS NULL OR trim(note) = '' THEN 'Blocked'
  WHEN char_length(trim(note)) <= 40    THEN trim(note)
  ELSE left(trim(note), 40)
END
WHERE note_short = 'Blocked' AND note IS NOT NULL AND trim(note) != '';
