-- =============================================================================
-- 00021_appointments_booking.sql
--
-- Converts the appointments table for anonymous native bookings:
--
--   1. Make customer_id nullable  — bookings come in without a user account
--   2. Make service_id nullable   — anonymous bookings don't select from the
--                                   services catalog; service_type (free text)
--                                   is used instead
--   3. Make service_price default 0 (not NOT NULL w/ no default)
--   4. Add confirmation_code      — 6-char code shown to customer at kiosk
--   5. Add service_type           — free-text label e.g. "Haircut"
--   6. Add client_id              — FK to clients table (phone-dedup'd walk-in
--                                   record); this is how native bookings link to
--                                   a named client without a user account
--   7. GIST exclusion constraint  — DB-level overlap guard for the same barber;
--                                   catches races that application pre-checks miss
-- =============================================================================

-- 1 & 2: make customer_id and service_id nullable
ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL,
  ALTER COLUMN service_id  DROP NOT NULL;

-- 3: service_price already has a DEFAULT 0? Add it defensively.
ALTER TABLE public.appointments
  ALTER COLUMN service_price SET DEFAULT 0;

-- 4: confirmation code (e.g. "K7NP2X")
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_code VARCHAR(10);

-- 5: free-text service label for anonymous bookings
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(100);

-- 6: FK to clients table (phone-dedup'd record created at booking time)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_client
  ON public.appointments(client_id);

-- 7: GIST exclusion — prevents double-booking the same barber at the same time
--    Requires btree_gist extension (available in Supabase by default).
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_barber_no_overlap'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_barber_no_overlap
        EXCLUDE USING GIST (
          barber_id WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status IN ('pending', 'confirmed'));
  END IF;
END
$$;
