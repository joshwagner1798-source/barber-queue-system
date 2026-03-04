-- ---------------------------------------------------------------------------
-- Storage bucket for barber avatar photos
-- Used by POST /api/barber-photos/[barberId]
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'barber-photos',
  'barber-photos',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read avatar images (displayed on TV / kiosk)
CREATE POLICY "public read barber-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barber-photos');

-- Authenticated owners/admins can upload new photos
CREATE POLICY "owner insert barber-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'barber-photos' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );

-- Authenticated owners/admins can replace existing photos (upsert uses UPDATE)
CREATE POLICY "owner update barber-photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'barber-photos' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );

-- Authenticated owners/admins can delete photos
CREATE POLICY "owner delete barber-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'barber-photos' AND
    auth.uid() IN (SELECT auth_id FROM users WHERE role IN ('owner', 'admin'))
  );
