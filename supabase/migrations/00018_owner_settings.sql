-- Migration 00018: owner_settings table
-- Stores per-shop UI preferences (layout, theme, font size) for the TV display.
-- API routes bypass RLS via service-role key (createAdminClient), since they are PIN-gated.

CREATE TABLE IF NOT EXISTS owner_settings (
  shop_id    uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  layout     text NOT NULL DEFAULT 'compact',  -- 'compact' | 'large'
  theme      text NOT NULL DEFAULT 'dark',     -- 'dark' | 'light'
  font_size  text NOT NULL DEFAULT 'md',       -- 'sm' | 'md' | 'lg'
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE owner_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manage owner_settings" ON owner_settings FOR ALL
  USING (shop_id IN (
    SELECT shop_id FROM users WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
  ));
