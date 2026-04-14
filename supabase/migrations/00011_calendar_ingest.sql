-- =============================================================================
-- CALENDAR INGEST + RECONCILE SCHEMA
-- =============================================================================
--
-- NOTE: The spec assumes an 'appointments' table doesn't exist, but one was
-- created in 00001_initial_schema.sql for the native booking system.
-- Provider-synced calendar appointments are stored in 'provider_appointments'
-- to avoid collision with the booking system table.
--
-- NOTE: The spec references a 'shop_members' table for RLS. This project uses
-- the existing 'users' table with a 'role' column instead.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTION: set_updated_at
-- Distinct from the existing update_updated_at_column() — applied to the
-- new calendar tables below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: calendar_connections
-- Maps (shop, barber) → external provider calendar ID.
-- =============================================================================
CREATE TABLE IF NOT EXISTS calendar_connections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              uuid        NOT NULL,
  barber_id            uuid        NOT NULL,
  provider             text        NOT NULL DEFAULT 'acuity',
  -- Always stored as string; never cast to numeric (avoids ID mismatches).
  provider_calendar_id text        NOT NULL,
  active               boolean     NOT NULL DEFAULT true,
  last_sync_at         timestamptz,
  last_webhook_at      timestamptz,
  sync_health          text        NOT NULL DEFAULT 'OK',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_cal_conn_shop_barber_provider
    UNIQUE (shop_id, barber_id, provider),
  CONSTRAINT uq_cal_conn_shop_provider_cal
    UNIQUE (shop_id, provider, provider_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_conn_shop
  ON calendar_connections (shop_id);
CREATE INDEX IF NOT EXISTS idx_cal_conn_cal_id
  ON calendar_connections (provider_calendar_id);

CREATE TRIGGER trg_calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

-- Reads: authenticated users who belong to the shop
CREATE POLICY "cal_conn_select_shop_members"
  ON calendar_connections FOR SELECT
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Writes: authenticated admins / owners
CREATE POLICY "cal_conn_write_admins"
  ON calendar_connections FOR ALL
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Service role: unrestricted (used by webhook / reconcile routes)
CREATE POLICY "cal_conn_service_role_all"
  ON calendar_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TABLE: calendar_webhook_events
-- Idempotent ledger for incoming Acuity webhook calls.
-- =============================================================================
CREATE TABLE IF NOT EXISTS calendar_webhook_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL,
  -- Composite idempotency key: "<appointment_id>:<action>"
  -- e.g. "12345:rescheduled"
  provider_event_id text        NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload_json      jsonb       NOT NULL,
  processed_at      timestamptz,
  status            text        NOT NULL DEFAULT 'RECEIVED',
  error             text,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_webhook_events_provider_event
    UNIQUE (provider, provider_event_id)
);

CREATE TRIGGER trg_webhook_events_updated_at
  BEFORE UPDATE ON calendar_webhook_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE calendar_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role touches webhook events (internal processing table)
CREATE POLICY "webhook_events_service_role_all"
  ON calendar_webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- TABLE: provider_appointments
-- Appointments synced from external calendar providers (Acuity, etc.).
-- Separate from the native 'appointments' booking table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS provider_appointments (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 uuid        NOT NULL,
  barber_id               uuid        NOT NULL,
  provider                text        NOT NULL DEFAULT 'acuity',
  provider_appointment_id text        NOT NULL,
  -- Always stored as string; mirrors calendar_connections.provider_calendar_id
  provider_calendar_id    text        NOT NULL,
  start_at                timestamptz NOT NULL,
  end_at                  timestamptz NOT NULL,
  -- Values: ACTIVE | CANCELLED | DELETED (drift-repair)
  status                  text        NOT NULL,
  last_seen_at            timestamptz NOT NULL DEFAULT now(),
  payload_json            jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_provider_appt_provider_id
    UNIQUE (provider, provider_appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_appt_shop_barber_start
  ON provider_appointments (shop_id, barber_id, start_at);
CREATE INDEX IF NOT EXISTS idx_provider_appt_shop_start
  ON provider_appointments (shop_id, start_at);

CREATE TRIGGER trg_provider_appointments_updated_at
  BEFORE UPDATE ON provider_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE provider_appointments ENABLE ROW LEVEL SECURITY;

-- Reads: authenticated users who belong to the shop
CREATE POLICY "provider_appt_select_shop_members"
  ON provider_appointments FOR SELECT
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Writes: authenticated admins / owners
CREATE POLICY "provider_appt_write_admins"
  ON provider_appointments FOR ALL
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Service role: unrestricted (used by webhook / reconcile routes)
CREATE POLICY "provider_appt_service_role_all"
  ON provider_appointments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
