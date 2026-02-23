-- Add off_until_at to calendar_connections
-- Populated by the reconcile-acuity job via Acuity availability API.
-- NULL  → barber has availability today (working)
-- value → ISO timestamp of first available slot (barber is off until then)

ALTER TABLE calendar_connections
  ADD COLUMN IF NOT EXISTS off_until_at TIMESTAMPTZ;
