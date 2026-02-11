-- =============================================
-- WALK-IN KIOSK LAYER
-- clients, barber_status, walkins additions, safe views, RLS
-- =============================================

-- =============================================
-- 1. ADD calendar provider ID to USERS
-- =============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS acuity_calendar_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_acuity_cal
  ON users(acuity_calendar_id)
  WHERE acuity_calendar_id IS NOT NULL;

-- =============================================
-- 2. CLIENTS TABLE (phone-based dedup, private)
-- Phone numbers NEVER leave this table.
-- TV and kiosk only see display_name on walkins.
-- =============================================
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  first_name      VARCHAR(100) NOT NULL,
  last_initial    VARCHAR(1)   NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  display_name    VARCHAR(110) NOT NULL,  -- "FirstName L."
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT clients_shop_phone_unique UNIQUE (shop_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_clients_shop_phone
  ON clients(shop_id, phone);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: locked down. Only service-role (admin client) can access.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_admin_select" ON clients
  FOR SELECT USING (is_admin_or_owner());
CREATE POLICY "clients_admin_insert" ON clients
  FOR INSERT WITH CHECK (is_admin_or_owner());
CREATE POLICY "clients_admin_update" ON clients
  FOR UPDATE USING (is_admin_or_owner());

-- =============================================
-- 3. BARBER_STATUS TABLE (internal truth, fed by dispatcher)
-- Separate from barber_state — this table is provider-driven.
-- Contains NO sensitive data — safe for anon SELECT.
-- =============================================
CREATE TABLE IF NOT EXISTS barber_status (
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  barber_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'UNKNOWN',
  -- status values: 'FREE', 'BUSY', 'UNAVAILABLE', 'OFF', 'UNKNOWN'
  status_detail   TEXT,           -- block reason e.g. "Picking son up"
  free_at         TIMESTAMPTZ,    -- estimated time barber becomes free
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (shop_id, barber_id)
);

CREATE TRIGGER update_barber_status_updated_at
  BEFORE UPDATE ON barber_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE barber_status ENABLE ROW LEVEL SECURITY;

-- barber_status contains only status data — no PII. Safe for anon.
CREATE POLICY "barber_status_anon_select" ON barber_status
  FOR SELECT TO anon USING (true);
CREATE POLICY "barber_status_auth_select" ON barber_status
  FOR SELECT TO authenticated USING (true);
-- Service role handles all writes (bypasses RLS automatically)

-- =============================================
-- 4. ADD KIOSK COLUMNS TO WALKINS TABLE
-- =============================================
ALTER TABLE walkins ADD COLUMN IF NOT EXISTS client_id          UUID REFERENCES clients(id);
ALTER TABLE walkins ADD COLUMN IF NOT EXISTS display_name       VARCHAR(110);
ALTER TABLE walkins ADD COLUMN IF NOT EXISTS assigned_barber_id UUID REFERENCES users(id);
ALTER TABLE walkins ADD COLUMN IF NOT EXISTS called_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_walkins_client
  ON walkins(client_id);
CREATE INDEX IF NOT EXISTS idx_walkins_assigned
  ON walkins(shop_id, status, assigned_barber_id);

-- =============================================
-- 5. SAFE VIEWS FOR TV + KIOSK (no PII exposed)
-- =============================================

-- TV-safe view of walkins: no client_id, no phone, only display data.
-- Supabase Realtime can subscribe to the underlying table;
-- the view is for initial load / REST queries.
CREATE OR REPLACE VIEW public_walkins AS
SELECT
  id,
  shop_id,
  status,
  display_name,
  position,
  assigned_barber_id,
  called_at,
  preference_type,
  preferred_barber_id,
  service_type,
  created_at
FROM walkins;

-- TV-safe view of barbers: no email, no phone, no auth_id.
CREATE OR REPLACE VIEW public_barbers AS
SELECT
  id,
  shop_id,
  first_name,
  last_name,
  avatar_url,
  is_active,
  display_order
FROM users
WHERE role = 'barber' AND is_active = true;

-- =============================================
-- 6. ANONYMOUS RLS / GRANTS
-- =============================================

-- Grant anon SELECT on the safe views only.
GRANT SELECT ON public_walkins TO anon;
GRANT SELECT ON public_barbers TO anon;

-- Grant authenticated SELECT on the safe views too.
GRANT SELECT ON public_walkins TO authenticated;
GRANT SELECT ON public_barbers TO authenticated;

-- NO anon INSERT/UPDATE on walkins — kiosk uses service role (createAdminClient).
-- NO anon SELECT on full users table — use public_barbers view instead.
-- NO anon SELECT on full walkins table — use public_walkins view instead.

-- Services: anon can SELECT active services (for kiosk service dropdown)
CREATE POLICY "services_anon_select_active" ON services
  FOR SELECT TO anon USING (is_active = true);
