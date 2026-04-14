-- supabase/migrations/00019_barber_photo_position.sql
alter table users
  add column if not exists photo_x float default 50,
  add column if not exists photo_y float default 50;
