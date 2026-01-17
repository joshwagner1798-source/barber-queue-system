-- =============================================
-- BARBERSHOP SCHEDULING TOOL - INITIAL SCHEMA
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- SHOPS TABLE (Multi-tenant foundation)
-- =============================================
CREATE TABLE shops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,
  slug              VARCHAR(100) UNIQUE NOT NULL,
  address           TEXT,
  phone             VARCHAR(20),
  email             VARCHAR(255),
  timezone          VARCHAR(50) DEFAULT 'America/New_York',
  currency          VARCHAR(3) DEFAULT 'USD',

  -- Business settings
  booking_lead_time_minutes    INT DEFAULT 60,
  booking_window_days          INT DEFAULT 30,
  cancellation_policy_hours    INT DEFAULT 24,
  deposit_percentage           DECIMAL(5,2) DEFAULT 0,
  require_deposit              BOOLEAN DEFAULT false,

  -- Metadata
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- USERS TABLE (Customers and Staff)
-- =============================================
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID REFERENCES shops(id) ON DELETE CASCADE,

  -- Supabase Auth link
  auth_id           UUID UNIQUE,

  -- Profile info
  email             VARCHAR(255) NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  phone             VARCHAR(20),
  avatar_url        TEXT,

  -- Role: 'customer', 'barber', 'admin', 'owner'
  role              VARCHAR(20) DEFAULT 'customer',

  -- Barber-specific fields
  bio               TEXT,
  specialties       TEXT[],
  is_active         BOOLEAN DEFAULT true,
  display_order     INT DEFAULT 0,

  -- Preferences
  email_notifications     BOOLEAN DEFAULT true,
  sms_notifications       BOOLEAN DEFAULT false,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT users_shop_email_unique UNIQUE (shop_id, email)
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_shop_role ON users(shop_id, role);

-- =============================================
-- SERVICES TABLE
-- =============================================
CREATE TABLE services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL,
  price             DECIMAL(10,2) NOT NULL,
  deposit_amount    DECIMAL(10,2),

  -- Categorization
  category          VARCHAR(50),
  is_active         BOOLEAN DEFAULT true,
  display_order     INT DEFAULT 0,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_services_shop ON services(shop_id);
CREATE INDEX idx_services_active ON services(shop_id, is_active);

-- =============================================
-- BARBER_SERVICES (Which barbers offer which services)
-- =============================================
CREATE TABLE barber_services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barber_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,

  -- Optional price/duration override per barber
  price_override    DECIMAL(10,2),
  duration_override INT,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT barber_services_unique UNIQUE (barber_id, service_id)
);

-- =============================================
-- BUSINESS_HOURS TABLE
-- =============================================
CREATE TABLE business_hours (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  barber_id         UUID REFERENCES users(id) ON DELETE CASCADE,

  day_of_week       INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time         TIME NOT NULL,
  close_time        TIME NOT NULL,
  is_closed         BOOLEAN DEFAULT false,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT business_hours_unique UNIQUE (shop_id, barber_id, day_of_week)
);

-- =============================================
-- TIME_BLOCKS TABLE (Breaks, time off, special availability)
-- =============================================
CREATE TABLE time_blocks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  barber_id         UUID REFERENCES users(id) ON DELETE CASCADE,

  block_type        VARCHAR(20) NOT NULL,
  title             VARCHAR(100),

  start_datetime    TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime      TIMESTAMP WITH TIME ZONE NOT NULL,

  recurrence_rule   TEXT,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_time_blocks_barber_dates ON time_blocks(barber_id, start_datetime, end_datetime);

-- =============================================
-- APPOINTMENTS TABLE
-- =============================================
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Who
  customer_id       UUID NOT NULL REFERENCES users(id),
  barber_id         UUID NOT NULL REFERENCES users(id),
  service_id        UUID NOT NULL REFERENCES services(id),

  -- When
  start_time        TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time          TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Pricing (snapshot at booking time)
  service_price     DECIMAL(10,2) NOT NULL,
  deposit_amount    DECIMAL(10,2) DEFAULT 0,

  -- Status: 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'
  status            VARCHAR(20) DEFAULT 'pending',

  -- Customer notes
  notes             TEXT,

  -- Cancellation
  cancelled_at      TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  cancelled_by      UUID REFERENCES users(id),

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointments_shop_date ON appointments(shop_id, start_time);
CREATE INDEX idx_appointments_barber_date ON appointments(barber_id, start_time);
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_status ON appointments(shop_id, status);

-- =============================================
-- PAYMENTS TABLE
-- =============================================
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_id    UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,

  -- Stripe data
  stripe_payment_intent_id   VARCHAR(255) UNIQUE,
  stripe_charge_id           VARCHAR(255),

  amount            DECIMAL(10,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'USD',

  -- Status: 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
  status            VARCHAR(20) DEFAULT 'pending',

  -- Payment type: 'deposit', 'full_payment', 'remaining_balance'
  payment_type      VARCHAR(30) NOT NULL,

  -- Refund tracking
  refunded_amount   DECIMAL(10,2) DEFAULT 0,
  refund_reason     TEXT,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_appointment ON payments(appointment_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);

-- =============================================
-- NOTIFICATIONS TABLE (Audit trail)
-- =============================================
CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id    UUID REFERENCES appointments(id) ON DELETE SET NULL,

  notification_type VARCHAR(50) NOT NULL,
  channel           VARCHAR(10) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending',

  subject           VARCHAR(255),
  body_preview      TEXT,

  sent_at           TIMESTAMP WITH TIME ZONE,
  error_message     TEXT,

  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status, created_at);

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON shops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON business_hours
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_blocks_updated_at BEFORE UPDATE ON time_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
