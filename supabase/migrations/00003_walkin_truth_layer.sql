-- =============================================
-- WALK-IN TRUTH LAYER - TABLES & INDEXES
-- =============================================

-- =============================================
-- WALKINS TABLE
-- =============================================
CREATE TABLE walkins (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  service_type        TEXT NOT NULL DEFAULT 'cut',
  preference_type     TEXT NOT NULL DEFAULT 'ANY',       -- ANY|PREFERRED|FASTEST
  preferred_barber_id UUID NULL REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'WAITING',    -- WAITING|CALLED|IN_SERVICE|NO_SHOW|DONE|REMOVED
  position            INT NOT NULL DEFAULT 0,
  notes               TEXT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BARBER_STATE TABLE
-- =============================================
CREATE TABLE barber_state (
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  barber_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state               TEXT NOT NULL DEFAULT 'AVAILABLE',  -- AVAILABLE|IN_CHAIR|ON_BREAK|OFF|CLEANUP|OTHER
  state_since         TIMESTAMPTZ NOT NULL DEFAULT now(),
  manual_free_at      TIMESTAMPTZ NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (shop_id, barber_id)
);

-- =============================================
-- ASSIGNMENTS TABLE
-- =============================================
CREATE TABLE assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  walkin_id           UUID NOT NULL REFERENCES walkins(id) ON DELETE CASCADE,
  barber_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- EVENTS TABLE (append-only)
-- =============================================
CREATE TABLE events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  actor_user_id       UUID NULL REFERENCES users(id),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- SHOP_STATE_PROJECTION TABLE
-- =============================================
CREATE TABLE shop_state_projection (
  shop_id             UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  revision            BIGINT NOT NULL DEFAULT 0,
  snapshot            JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_walkins_shop_status_pos ON walkins(shop_id, status, position);
CREATE INDEX idx_assignments_shop_barber_end ON assignments(shop_id, barber_id, ended_at);
CREATE INDEX idx_events_shop_created ON events(shop_id, created_at DESC);

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================
CREATE TRIGGER update_walkins_updated_at BEFORE UPDATE ON walkins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_barber_state_updated_at BEFORE UPDATE ON barber_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shop_state_projection_updated_at BEFORE UPDATE ON shop_state_projection
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
