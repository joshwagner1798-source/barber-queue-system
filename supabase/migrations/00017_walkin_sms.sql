-- =============================================
-- WALK-IN SMS OFFER LAYER
-- Adds walkin_enabled flag to barbers and
-- creates the walkin_assignment_attempts table
-- for the SMS yes/no offer rotation.
-- =============================================

-- =============================================
-- 1. ADD walkin_enabled TO users TABLE
-- Controls whether a barber receives walk-in SMS offers.
-- Appointment-only barbers (Tyrik, Will) are set to false.
-- They still appear on TV/queue — this flag ONLY affects
-- walk-in assignment and SMS offer rotation.
-- =============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS walkin_enabled BOOLEAN NOT NULL DEFAULT true;

-- Seed: appointment-only barbers must never receive walk-in offers.
-- Uses first_name match scoped to barbers only (safe for this shop).
UPDATE users
SET walkin_enabled = false
WHERE role = 'barber'
  AND first_name IN ('Tyrik', 'Will');

-- =============================================
-- 2. WALKIN_ASSIGNMENT_ATTEMPTS TABLE
-- Tracks each SMS offer attempt in the rotation.
-- One pending attempt per walk-in at a time (partial unique index).
-- One accepted attempt per walk-in maximum (partial unique index).
-- =============================================
CREATE TABLE IF NOT EXISTS walkin_assignment_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  walkin_id    UUID        NOT NULL REFERENCES walkins(id) ON DELETE CASCADE,
  barber_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','accepted','declined','timeout','canceled')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 seconds'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- General lookup indexes
CREATE INDEX IF NOT EXISTS idx_waa_walkin_status
  ON walkin_assignment_attempts(walkin_id, status);

CREATE INDEX IF NOT EXISTS idx_waa_barber_status
  ON walkin_assignment_attempts(barber_id, status);

-- Partial index for fast expired-pending scans in the timeout job
CREATE INDEX IF NOT EXISTS idx_waa_expires_pending
  ON walkin_assignment_attempts(expires_at)
  WHERE status = 'pending';

-- Safety: only ONE accepted attempt per walk-in
CREATE UNIQUE INDEX IF NOT EXISTS idx_waa_walkin_accepted_unique
  ON walkin_assignment_attempts(walkin_id)
  WHERE status = 'accepted';

-- Safety: only ONE pending attempt per walk-in at a time
-- (enforces single-barber offer rotation; remove this index for batch mode)
CREATE UNIQUE INDEX IF NOT EXISTS idx_waa_walkin_pending_unique
  ON walkin_assignment_attempts(walkin_id)
  WHERE status = 'pending';

-- =============================================
-- 3. RLS FOR walkin_assignment_attempts
-- All access via service role (admin client) — same pattern as clients table.
-- =============================================
ALTER TABLE walkin_assignment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waa_admin_select" ON walkin_assignment_attempts
  FOR SELECT USING (is_admin_or_owner());

CREATE POLICY "waa_admin_insert" ON walkin_assignment_attempts
  FOR INSERT WITH CHECK (is_admin_or_owner());

CREATE POLICY "waa_admin_update" ON walkin_assignment_attempts
  FOR UPDATE USING (is_admin_or_owner());
