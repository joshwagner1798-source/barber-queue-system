# Walk-in SMS Offer System — Test Plan

## Prerequisites

- Twilio test credentials configured in `.env.local`
- At least 2 active barbers with `walkin_enabled=true` and phone numbers in the DB
- Tyrik and Will have `walkin_enabled=false`
- Supabase migration 00017 applied

---

## 1. Database — Migration Correctness

| # | Check | How |
|---|-------|-----|
| 1.1 | `users.walkin_enabled` column exists with default `true` | `SELECT walkin_enabled FROM users LIMIT 5` |
| 1.2 | Tyrik's record has `walkin_enabled = false` | `SELECT first_name, walkin_enabled FROM users WHERE role='barber'` |
| 1.3 | Will's record has `walkin_enabled = false` | Same query |
| 1.4 | `walkin_assignment_attempts` table exists with all columns | `\d walkin_assignment_attempts` |
| 1.5 | Partial unique index on `(walkin_id) WHERE status='pending'` prevents two pending rows | Insert two pending rows for the same walkin_id → second should fail with unique violation |
| 1.6 | Partial unique index on `(walkin_id) WHERE status='accepted'` prevents double-accept | Insert two accepted rows for same walkin_id → second should fail |
| 1.7 | `expires_at` defaults to `now() + interval '90 seconds'` | Insert a row without setting expires_at, check the value |

---

## 2. Eligibility — getEligibleBarbers()

| # | Scenario | Expected |
|---|----------|----------|
| 2.1 | Barber has `walkin_enabled=false` | Never in eligible list |
| 2.2 | Barber has `walkin_enabled=true` but `barber_state.state = 'ON_BREAK'` | Not eligible (filtered by getShopAvailability) |
| 2.3 | Barber has `walkin_enabled=true`, state=`AVAILABLE`, within shift, no upcoming appt | Eligible |
| 2.4 | Barber has `walkin_enabled=true` but no phone number | Excluded (phone IS NULL filter) |
| 2.5 | Barber is outside their shift window | Not eligible |
| 2.6 | Two eligible barbers — one idle longer | Idle-longer barber is first in returned list |
| 2.7 | All eligible barbers in `excludeBarberIds` | Returns empty array |

---

## 3. Offer Initiation — initiateWalkinOffer()

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | Walk-in created, one eligible barber | `walkin_assignment_attempts` row inserted with `status='pending'` |
| 3.2 | Walk-in created, no eligible barbers | No attempt row inserted; `WALKIN_OFFER_EXHAUSTED` event logged |
| 3.3 | Called twice for same walk-in | Only one `pending` row exists (idempotent via partial unique index) |
| 3.4 | Walk-in already `CALLED` when function runs | Function exits early, no attempt created |

---

## 4. SMS Delivery — sendOfferToBarber()

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | Valid Twilio credentials, valid E.164 number | SMS sent, `WALKIN_OFFER_SENT` event logged |
| 4.2 | Twilio returns an error (e.g. bad number) | `WALKIN_OFFER_SMS_ERROR` event logged, attempt record still exists (barber can still reply if they somehow got the message) |
| 4.3 | Two concurrent calls for same walk-in | Second insert fails on unique index → exits silently, only one SMS sent |

---

## 5. YES Path — handleOfferAccepted()

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | Barber replies YES, walk-in is still WAITING | `walkins.status → 'CALLED'`, `assigned_barber_id` set, `assignments` row created, attempt `status → 'accepted'`, `WALKIN_OFFER_ACCEPTED` event |
| 5.2 | Two barbers both reply YES simultaneously | Only one atomic UPDATE succeeds (returns a row); winner gets `accepted`, loser's attempt set to `canceled` |
| 5.3 | Barber replies YES after walk-in has been manually assigned (status != WAITING) | Returns `{accepted: false}`, attempt set to `canceled` |
| 5.4 | TV display (via realtime) updates after assignment | Supabase realtime fires on `walkins` table update — TV should update automatically (no change to realtime wiring needed) |

---

## 6. NO Path — handleOfferDeclined()

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | Barber replies NO, second eligible barber exists | Attempt `status → 'declined'`, `WALKIN_OFFER_DECLINED` event, second barber receives SMS within seconds |
| 6.2 | Barber replies NO, no more eligible barbers | `WALKIN_OFFER_EXHAUSTED` event logged, walk-in remains in WAITING state |
| 6.3 | Barber who was already declined is not re-offered | `excludeBarberIds` list grows with each decline |

---

## 7. Timeout — processExpiredAttempts()

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | Offer not answered for 90+ seconds | Attempt `status → 'timeout'`, `WALKIN_OFFER_TIMEOUT` event, rotation advances to next barber |
| 7.2 | Timeout fires, but barber also replied YES simultaneously | The YES handler's conditional update on `status='pending'` wins; timeout's update is a no-op (updateErr check skips it) |
| 7.3 | `GET /api/jobs/walkin-timeouts` called without Bearer token | 401 |
| 7.4 | `GET /api/jobs/walkin-timeouts` called with correct `CRON_SECRET` | 200 `{processed: N}` |

---

## 8. Twilio Webhook — POST /api/sms-response

| # | Scenario | Expected |
|---|----------|----------|
| 8.1 | POST with `From=<barber phone>`, `Body=YES` | Walk-in claimed, TwiML `<Message>Walk-in accepted...</Message>` returned |
| 8.2 | POST with `From=<barber phone>`, `Body=NO` | Attempt declined, rotation advances, TwiML confirmation |
| 8.3 | POST with `Body=yes` (lowercase) | Treated as YES (toUpperCase normalization) |
| 8.4 | POST with `Body=SURE` (unknown intent) | TwiML `Reply YES to accept or NO to skip` |
| 8.5 | POST from unknown phone number | Empty TwiML 200 (silent ignore) |
| 8.6 | POST from barber with no pending offer | TwiML "No active walk-in offer for you right now." |
| 8.7 | POST from barber whose offer expired | TwiML expiry message |

---

## 9. Appointment-Only Barber Constraints (Tyrik / Will)

| # | Check | Expected |
|---|-------|----------|
| 9.1 | Tyrik is in a walkin-eligible query | Never returned by `getEligibleBarbers()` |
| 9.2 | Tyrik responds YES to a text (if somehow sent) | Phone lookup finds no pending attempt → TwiML "No active offer" |
| 9.3 | Tyrik appears on TV display | Yes — `walkin_enabled` does not affect `/api/tv` or realtime subscription |
| 9.4 | Dispatcher auto-assign runs while Tyrik is FREE | Tyrik is filtered out by `walkinEnabledSet` — not assigned any walk-in |
| 9.5 | Tyrik marks himself AVAILABLE via barber-state API | `processBarberAvailable` exits with reason `walkin_enabled=false` — no auto-assign |

---

## 10. End-to-End Smoke Test

1. Add a walk-in via the kiosk (`POST /api/kiosk/walkins`)
2. Verify `walkin_assignment_attempts` has one `pending` row
3. Verify the first eligible barber received an SMS (check Twilio dashboard or test logs)
4. Call `POST /api/sms-response` with `Body=NO` to simulate decline
5. Verify attempt is `declined`, next barber gets an SMS
6. Call `POST /api/sms-response` with `Body=YES` for the second barber
7. Verify walk-in `status = 'CALLED'`, `assigned_barber_id` set
8. Verify `assignments` row created
9. Verify TV display (realtime) shows walk-in as assigned

---

## Environment Variables Required

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567   # Your Twilio number

# Jobs
WALKIN_TIMEOUT_SECRET=some-long-secret   # For /api/jobs/walkin-timeouts
# CRON_SECRET is injected automatically by Vercel
```
