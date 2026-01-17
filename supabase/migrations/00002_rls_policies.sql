-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get current user's shop_id
CREATE OR REPLACE FUNCTION get_user_shop_id()
RETURNS UUID AS $$
  SELECT shop_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is admin/owner
CREATE OR REPLACE FUNCTION is_admin_or_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get current user's id from users table
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =============================================
-- SHOPS POLICIES
-- =============================================

-- Anyone can read shops (for booking page)
CREATE POLICY "shops_select_all" ON shops
  FOR SELECT USING (true);

-- Only owners can update their shop
CREATE POLICY "shops_update_owner" ON shops
  FOR UPDATE USING (is_admin_or_owner() AND id = get_user_shop_id());

-- =============================================
-- USERS POLICIES
-- =============================================

-- Users can read barbers (public), own profile, or all if admin
CREATE POLICY "users_select" ON users
  FOR SELECT USING (
    role IN ('barber', 'admin', 'owner')  -- Public can see staff
    OR auth_id = auth.uid()                -- Users can see themselves
    OR is_admin_or_owner()                 -- Admins can see all
  );

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- Admins can insert new users (barbers)
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (is_admin_or_owner());

-- Users can insert themselves (signup)
CREATE POLICY "users_insert_self" ON users
  FOR INSERT WITH CHECK (auth_id = auth.uid());

-- =============================================
-- SERVICES POLICIES
-- =============================================

-- Anyone can read active services
CREATE POLICY "services_select_active" ON services
  FOR SELECT USING (is_active = true OR is_admin_or_owner());

-- Admins can manage services
CREATE POLICY "services_insert_admin" ON services
  FOR INSERT WITH CHECK (is_admin_or_owner());

CREATE POLICY "services_update_admin" ON services
  FOR UPDATE USING (is_admin_or_owner());

CREATE POLICY "services_delete_admin" ON services
  FOR DELETE USING (is_admin_or_owner());

-- =============================================
-- BARBER_SERVICES POLICIES
-- =============================================

-- Anyone can read barber services
CREATE POLICY "barber_services_select" ON barber_services
  FOR SELECT USING (true);

-- Admins can manage
CREATE POLICY "barber_services_admin" ON barber_services
  FOR ALL USING (is_admin_or_owner());

-- =============================================
-- APPOINTMENTS POLICIES
-- =============================================

-- Customers see their own, barbers see assigned, admin sees all
CREATE POLICY "appointments_select" ON appointments
  FOR SELECT USING (
    customer_id = get_current_user_id()
    OR barber_id = get_current_user_id()
    OR is_admin_or_owner()
  );

-- Customers can create their own appointments
CREATE POLICY "appointments_insert" ON appointments
  FOR INSERT WITH CHECK (
    customer_id = get_current_user_id()
    OR is_admin_or_owner()
  );

-- Customers can update their own appointments (for cancellation)
CREATE POLICY "appointments_update" ON appointments
  FOR UPDATE USING (
    customer_id = get_current_user_id()
    OR is_admin_or_owner()
  );

-- =============================================
-- PAYMENTS POLICIES
-- =============================================

-- Users can see payments for their appointments
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = payments.appointment_id
      AND (
        appointments.customer_id = get_current_user_id()
        OR is_admin_or_owner()
      )
    )
  );

-- System inserts payments (via service role)
CREATE POLICY "payments_insert_system" ON payments
  FOR INSERT WITH CHECK (true);

-- =============================================
-- BUSINESS_HOURS POLICIES
-- =============================================

-- Anyone can read business hours (for availability)
CREATE POLICY "business_hours_select" ON business_hours
  FOR SELECT USING (true);

-- Admins can manage
CREATE POLICY "business_hours_admin" ON business_hours
  FOR ALL USING (is_admin_or_owner());

-- =============================================
-- TIME_BLOCKS POLICIES
-- =============================================

-- Anyone can read time blocks (for availability)
CREATE POLICY "time_blocks_select" ON time_blocks
  FOR SELECT USING (true);

-- Admins can manage, barbers can manage their own
CREATE POLICY "time_blocks_insert" ON time_blocks
  FOR INSERT WITH CHECK (
    is_admin_or_owner()
    OR barber_id = get_current_user_id()
  );

CREATE POLICY "time_blocks_update" ON time_blocks
  FOR UPDATE USING (
    is_admin_or_owner()
    OR barber_id = get_current_user_id()
  );

CREATE POLICY "time_blocks_delete" ON time_blocks
  FOR DELETE USING (
    is_admin_or_owner()
    OR barber_id = get_current_user_id()
  );

-- =============================================
-- NOTIFICATIONS POLICIES
-- =============================================

-- Users can see their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    user_id = get_current_user_id()
    OR is_admin_or_owner()
  );
