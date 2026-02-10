-- =============================================
-- WALK-IN TRUTH LAYER - ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all new tables
ALTER TABLE walkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_state_projection ENABLE ROW LEVEL SECURITY;

-- =============================================
-- WALKINS POLICIES
-- =============================================

-- Authenticated users can read walkins in their shop
CREATE POLICY "walkins_select_shop" ON walkins
  FOR SELECT USING (shop_id = get_user_shop_id());

-- Admins/owners and barbers can insert walkins for their shop
CREATE POLICY "walkins_insert_shop" ON walkins
  FOR INSERT WITH CHECK (shop_id = get_user_shop_id());

-- Admins/owners and barbers can update walkins in their shop
CREATE POLICY "walkins_update_shop" ON walkins
  FOR UPDATE USING (shop_id = get_user_shop_id());

-- Admins/owners can delete walkins in their shop
CREATE POLICY "walkins_delete_shop" ON walkins
  FOR DELETE USING (shop_id = get_user_shop_id());

-- =============================================
-- BARBER_STATE POLICIES
-- =============================================

-- Authenticated users can read barber state in their shop
CREATE POLICY "barber_state_select_shop" ON barber_state
  FOR SELECT USING (shop_id = get_user_shop_id());

-- Authenticated users can insert barber state for their shop
CREATE POLICY "barber_state_insert_shop" ON barber_state
  FOR INSERT WITH CHECK (shop_id = get_user_shop_id());

-- Authenticated users can update barber state in their shop
CREATE POLICY "barber_state_update_shop" ON barber_state
  FOR UPDATE USING (shop_id = get_user_shop_id());

-- Authenticated users can delete barber state in their shop
CREATE POLICY "barber_state_delete_shop" ON barber_state
  FOR DELETE USING (shop_id = get_user_shop_id());

-- =============================================
-- ASSIGNMENTS POLICIES
-- =============================================

-- Authenticated users can read assignments in their shop
CREATE POLICY "assignments_select_shop" ON assignments
  FOR SELECT USING (shop_id = get_user_shop_id());

-- Authenticated users can insert assignments for their shop
CREATE POLICY "assignments_insert_shop" ON assignments
  FOR INSERT WITH CHECK (shop_id = get_user_shop_id());

-- Authenticated users can update assignments in their shop
CREATE POLICY "assignments_update_shop" ON assignments
  FOR UPDATE USING (shop_id = get_user_shop_id());

-- Authenticated users can delete assignments in their shop
CREATE POLICY "assignments_delete_shop" ON assignments
  FOR DELETE USING (shop_id = get_user_shop_id());

-- =============================================
-- EVENTS POLICIES
-- =============================================

-- Authenticated users can read events in their shop
CREATE POLICY "events_select_shop" ON events
  FOR SELECT USING (shop_id = get_user_shop_id());

-- Authenticated users can insert events for their shop
CREATE POLICY "events_insert_shop" ON events
  FOR INSERT WITH CHECK (shop_id = get_user_shop_id());

-- Events are append-only: no update or delete policies

-- =============================================
-- SHOP_STATE_PROJECTION POLICIES
-- =============================================

-- Authenticated users can read the projection for their shop
CREATE POLICY "shop_state_projection_select_shop" ON shop_state_projection
  FOR SELECT USING (shop_id = get_user_shop_id());

-- Authenticated users can insert projection for their shop
CREATE POLICY "shop_state_projection_insert_shop" ON shop_state_projection
  FOR INSERT WITH CHECK (shop_id = get_user_shop_id());

-- Authenticated users can update projection for their shop
CREATE POLICY "shop_state_projection_update_shop" ON shop_state_projection
  FOR UPDATE USING (shop_id = get_user_shop_id());
