-- =============================================================================
-- provider_blocks: dedicated table for Acuity blocked times
-- Separate from provider_appointments so blocks have a clean schema and can
-- be drift-repaired by DELETE rather than status-flagging.
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_blocks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL DEFAULT 'acuity',
  provider_block_id text        NOT NULL,
  calendar_id       text        NOT NULL,
  barber_id         uuid        NOT NULL REFERENCES users(id),
  shop_id           uuid        NOT NULL,
  start_at          timestamptz NOT NULL,
  end_at            timestamptz NOT NULL,
  note              text,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_provider_blocks_provider_id UNIQUE (provider, provider_block_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_blocks_barber_window
  ON provider_blocks (barber_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_provider_blocks_shop_window
  ON provider_blocks (shop_id, start_at, end_at);

CREATE TRIGGER trg_provider_blocks_updated_at
  BEFORE UPDATE ON provider_blocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE provider_blocks ENABLE ROW LEVEL SECURITY;

-- Service role: unrestricted (reconcile + TV API run as service role)
CREATE POLICY "provider_blocks_service_role_all"
  ON provider_blocks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated shop members: read only
CREATE POLICY "provider_blocks_select_shop_members"
  ON provider_blocks FOR SELECT
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM users WHERE auth_id = auth.uid()
    )
  );
