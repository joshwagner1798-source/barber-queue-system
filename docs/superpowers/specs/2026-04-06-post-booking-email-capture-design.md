# Post-Booking Email Capture — Design Spec
**Date:** 2026-04-06

## Problem
The guest booking flow is fast and working. Returning customers can be recognized by
phone (implemented via `/api/booking/lookup`). But there is no way to move a customer
from the guest path to the saved-profile/account path — the data bridge is missing.

## Goal
After a guest booking is confirmed, offer an optional, low-friction way for customers
to attach their email. This is the foundation for:
- Future OTP-based "sign in faster" path
- Loyalty and CRM features
- Face-recognition link (future)

## Non-Goals
- No Supabase auth user creation in this step
- No OTP flow yet
- No forced email collection before booking
- No uniqueness constraint on email (added later when OTP path is built)

## Design

### Data layer
`clients` table gains a nullable `email VARCHAR(255)` column (no constraint).
Index on `(shop_id, email)` where email is not null.

### API
`POST /api/booking/save-email`
- Body: `{ confirmation_code, shop_id, email }`
- Looks up appointment by `confirmation_code + shop_id`
- Validates email format
- Updates `clients.email` where `id = appointment.client_id`
- Public endpoint (confirmation code acts as session token — customer just received it)

### UI — BarberBookingSheet (tv-display modal)
Confirmation screen gains an optional email section below booking details:
- "Book faster next time" label + email input + Save button
- "No thanks" dismissal link
- On save: input replaced by "✓ Email saved for faster booking next time"
- Section hidden after save or dismissal
- 30-second auto-close is unaffected

### UI — book/page.tsx (standalone /book page)
Identical email section added to the `step === 'confirmed'` view.

## Future integration
When the OTP path is added to `barber_scheduling`:
1. Lookup by phone checks if `clients.email` is set
2. If yes, offer "Sign in with email for saved profile"
3. Email OTP verifies identity → links to profile
4. `IdentityGate` pattern from `getshopqueue_scheduling` can be ported/adapted
