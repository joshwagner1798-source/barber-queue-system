-- =============================================
-- ATOMIC JOIN QUEUE FUNCTION
-- Replaces multi-round-trip kiosk logic with a single
-- transactional RPC call. Prevents race conditions on
-- position assignment via advisory lock on shop_id.
-- =============================================

CREATE OR REPLACE FUNCTION join_walkin_queue(
  p_shop_id              UUID,
  p_first_name           TEXT,
  p_last_initial         TEXT,
  p_phone                TEXT,
  p_preference_type      TEXT    DEFAULT 'ANY',
  p_preferred_barber_id  UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone              TEXT;
  v_display_name       TEXT;
  v_client_id          UUID;
  v_walkin_id          UUID;
  v_status             TEXT;
  v_position           INT;
  v_assigned_barber_id UUID;
  v_barber_name        TEXT;
  v_next_position      INT;
BEGIN
  -- 1. Normalize phone to digits only
  v_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- 2. Build display name: "Firstname L."
  v_display_name := initcap(trim(p_first_name))
                    || ' '
                    || upper(left(trim(p_last_initial), 1))
                    || '.';

  -- 3. Upsert client by (shop_id, phone)
  INSERT INTO clients (shop_id, first_name, last_initial, phone, display_name)
  VALUES (
    p_shop_id,
    trim(p_first_name),
    upper(left(trim(p_last_initial), 1)),
    v_phone,
    v_display_name
  )
  ON CONFLICT (shop_id, phone) DO UPDATE SET
    first_name   = EXCLUDED.first_name,
    last_initial = EXCLUDED.last_initial,
    display_name = EXCLUDED.display_name
  RETURNING id INTO v_client_id;

  -- 4. Check for existing active walkin
  SELECT w.id, w.status, w.position, w.assigned_barber_id
    INTO v_walkin_id, v_status, v_position, v_assigned_barber_id
    FROM walkins w
   WHERE w.shop_id   = p_shop_id
     AND w.client_id = v_client_id
     AND w.status IN ('WAITING', 'CALLED', 'IN_SERVICE')
   LIMIT 1;

  IF v_walkin_id IS NOT NULL THEN
    -- Resolve barber name if assigned
    IF v_assigned_barber_id IS NOT NULL THEN
      SELECT u.first_name || ' ' || u.last_name
        INTO v_barber_name
        FROM users u
       WHERE u.id = v_assigned_barber_id;
    END IF;

    RETURN jsonb_build_object(
      'already_active',       true,
      'walkin_id',            v_walkin_id,
      'status',               v_status,
      'position',             v_position,
      'display_name',         v_display_name,
      'assigned_barber_id',   v_assigned_barber_id,
      'assigned_barber_name', v_barber_name
    );
  END IF;

  -- 5. Advisory lock on shop to serialise position assignment
  PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text));

  -- 6. Compute next queue position
  SELECT COALESCE(MAX(w.position), 0) + 1
    INTO v_next_position
    FROM walkins w
   WHERE w.shop_id = p_shop_id
     AND w.status IN ('WAITING', 'CALLED', 'IN_SERVICE');

  -- 7. Insert new walkin
  INSERT INTO walkins (
    shop_id, client_id, display_name, service_type,
    preference_type, preferred_barber_id, status, position
  )
  VALUES (
    p_shop_id, v_client_id, v_display_name, 'cut',
    p_preference_type, p_preferred_barber_id, 'WAITING', v_next_position
  )
  RETURNING id INTO v_walkin_id;

  -- 8. Append event
  INSERT INTO events (shop_id, type, actor_user_id, payload)
  VALUES (
    p_shop_id,
    'WALKIN_ADDED',
    NULL,
    jsonb_build_object(
      'walkin_id',            v_walkin_id,
      'display_name',         v_display_name,
      'preference_type',      p_preference_type,
      'preferred_barber_id',  p_preferred_barber_id,
      'position',             v_next_position
    )
  );

  -- 9. Return new walkin result
  RETURN jsonb_build_object(
    'already_active', false,
    'walkin_id',      v_walkin_id,
    'position',       v_next_position,
    'display_name',   v_display_name
  );
END;
$$;
