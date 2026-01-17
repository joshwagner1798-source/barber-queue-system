-- =============================================
-- SEED DATA FOR DEVELOPMENT
-- =============================================

-- Insert a test shop
INSERT INTO shops (id, name, slug, address, phone, email, timezone, booking_lead_time_minutes, booking_window_days, cancellation_policy_hours, deposit_percentage, require_deposit)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Classic Cuts Barbershop',
  'classic-cuts',
  '123 Main Street, Anytown, ST 12345',
  '(555) 123-4567',
  'info@classiccuts.com',
  'America/New_York',
  60,      -- 1 hour lead time
  30,      -- 30 days booking window
  24,      -- 24 hour cancellation policy
  25.00,   -- 25% deposit
  false    -- Don't require deposit by default
);

-- Insert services
INSERT INTO services (shop_id, name, description, duration_minutes, price, category, display_order) VALUES
('00000000-0000-0000-0000-000000000001', 'Classic Haircut', 'Traditional haircut with precision and style. Includes hot towel and styling.', 30, 25.00, 'haircut', 1),
('00000000-0000-0000-0000-000000000001', 'Buzz Cut', 'Quick and clean buzz cut at your preferred length.', 15, 15.00, 'haircut', 2),
('00000000-0000-0000-0000-000000000001', 'Kids Haircut', 'Haircut for children under 12.', 20, 18.00, 'haircut', 3),
('00000000-0000-0000-0000-000000000001', 'Beard Trim', 'Shape and maintain your facial hair with precision.', 15, 15.00, 'beard', 4),
('00000000-0000-0000-0000-000000000001', 'Beard Shave', 'Traditional straight razor shave with hot towel treatment.', 30, 25.00, 'beard', 5),
('00000000-0000-0000-0000-000000000001', 'Haircut & Beard Combo', 'Full service haircut and beard grooming for the complete look.', 45, 35.00, 'combo', 6),
('00000000-0000-0000-0000-000000000001', 'Head Shave', 'Complete head shave with hot towel and moisturizer.', 30, 30.00, 'haircut', 7),
('00000000-0000-0000-0000-000000000001', 'Hair Design', 'Custom hair design or pattern shaved into your style.', 45, 40.00, 'specialty', 8);

-- Insert business hours (Mon-Sat open, Sunday closed)
INSERT INTO business_hours (shop_id, barber_id, day_of_week, open_time, close_time, is_closed) VALUES
-- Shop-wide hours (barber_id = NULL)
('00000000-0000-0000-0000-000000000001', NULL, 0, '09:00', '17:00', true),  -- Sunday - Closed
('00000000-0000-0000-0000-000000000001', NULL, 1, '09:00', '19:00', false), -- Monday
('00000000-0000-0000-0000-000000000001', NULL, 2, '09:00', '19:00', false), -- Tuesday
('00000000-0000-0000-0000-000000000001', NULL, 3, '09:00', '19:00', false), -- Wednesday
('00000000-0000-0000-0000-000000000001', NULL, 4, '09:00', '19:00', false), -- Thursday
('00000000-0000-0000-0000-000000000001', NULL, 5, '09:00', '19:00', false), -- Friday
('00000000-0000-0000-0000-000000000001', NULL, 6, '09:00', '17:00', false); -- Saturday

-- Note: Users (barbers, customers) should be created through the auth flow
-- The owner/admin user will be created when they sign up and can be promoted manually
-- For development, you may want to run this after creating a user:
--
-- UPDATE users SET role = 'owner' WHERE email = 'owner@example.com';
