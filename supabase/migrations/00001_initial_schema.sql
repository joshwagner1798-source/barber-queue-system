-- =============================================
-- BARBERSHOP SCHEDULING TOOL - INITIAL SCHEMA (FIXED)
-- =============================================

-- Supabase standard: put extension objects in "extensions"
CREATE SCHEMA IF NOT EXISTS extensions;

-- Enable UUID extension into extensions schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =============================================
-- SHOPS TABLE (Multi-tenant foundation)
-- =============================================
CREATE TABLE IF NOT EXISTS public.shops (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
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
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- USERS TABLE (Customers and Staff)
-- =============================================
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID REFERENCES public.shops(id) ON DELETE CASCADE,

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

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT users_shop_email_unique UNIQUE (shop_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_shop_role ON public.users(shop_id, role);

-- =============================================
-- SERVICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.services (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,

  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL,
  price             DECIMAL(10,2) NOT NULL,
  deposit_amount    DECIMAL(10,2),

  -- Categorization
  category          VARCHAR(50),
  is_active         BOOLEAN DEFAULT true,
  display_order     INT DEFAULT 0,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_shop ON public.services(shop_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(shop_id, is_active);

-- =============================================
-- BARBER_SERVICES (Which barbers offer which services)
-- =============================================
CREATE TABLE IF NOT EXISTS public.barber_services (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  barber_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,

  -- Optional price/duration override per barber
  price_override    DECIMAL(10,2),
  duration_override INT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT barber_services_unique UNIQUE (barber_id, service_id)
);

-- =============================================
-- BUSINESS_HOURS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.business_hours (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  barber_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,

  day_of_week       INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time         TIME NOT NULL,
  close_time        TIME NOT NULL,
  is_closed         BOOLEAN DEFAULT false,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT business_hours_unique UNIQUE (shop_id, barber_id, day_of_week)
);

-- =============================================
-- TIME_BLOCKS TABLE (Breaks, time off, special availability)
-- =============================================
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  barber_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,

  block_type        VARCHAR(20) NOT NULL,
  title             VARCHAR(100),

  start_datetime    TIMESTAMPTZ NOT NULL,
  end_datetime      TIMESTAMPTZ NOT NULL,

  recurrence_rule   TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_blocks_barber_dates
  ON public.time_blocks(barber_id, start_datetime, end_datetime);

-- =============================================
-- APPOINTMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,

  -- Who
  customer_id       UUID NOT NULL REFERENCES public.users(id),
  barber_id         UUID NOT NULL REFERENCES public.users(id),
  service_id        UUID NOT NULL REFERENCES public.services(id),

  -- When
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,

  -- Pricing (snapshot at booking time)
  service_price     DECIMAL(10,2) NOT NULL,
  deposit_amount    DECIMAL(10,2) DEFAULT 0,

  -- Status: 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'
  status            VARCHAR(20) DEFAULT 'pending',

  -- Customer notes
  notes             TEXT,

  -- Cancellation
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by      UUID REFERENCES public.users(id),

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_shop_date ON public.appointments(shop_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON public.appointments(barber_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(shop_id, status);

-- =============================================
-- PAYMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  appointment_id    UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,

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

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON public.payments(stripe_payment_intent_id);

-- =============================================
-- NOTIFICATIONS TABLE (Audit trail)
-- =============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  shop_id           UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  appointment_id    UUID REFERENCES public.appointments(id) ON DELETE SET NULL,

  notification_type VARCHAR(50) NOT NULL,
  channel           VARCHAR(10) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending',

  subject           VARCHAR(255),
  body_preview      TEXT,

  sent_at           TIMESTAMPTZ,
  error_message     TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status, created_at);

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
DROP TRIGGER IF EXISTS update_shops_updated_at ON public.shops;
CREATE TRIGGER update_shops_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_hours_updated_at ON public.business_hours;
CREATE TRIGGER update_business_hours_updated_at
  BEFORE UPDATE ON public.business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_blocks_updated_at ON public.time_blocks;
CREATE TRIGGER update_time_blocks_updated_at
  BEFORE UPDATE ON public.time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON public.appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();