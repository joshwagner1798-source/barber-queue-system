-- shop_settings: per-shop UI configuration (backgrounds, etc.)
CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id              uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  tv_background_url    text,
  kiosk_background_url text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

-- Owners/admins can manage their own shop's settings
CREATE POLICY "owner manage shop_settings"
  ON shop_settings FOR ALL
  USING (
    shop_id IN (
      SELECT shop_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket for TV / kiosk background images
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ui-backgrounds',
  'ui-backgrounds',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read ui-backgrounds"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ui-backgrounds');

CREATE POLICY "owner upload ui-backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ui-backgrounds' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );

CREATE POLICY "owner update ui-backgrounds"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ui-backgrounds' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );

CREATE POLICY "owner delete ui-backgrounds"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ui-backgrounds' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );
