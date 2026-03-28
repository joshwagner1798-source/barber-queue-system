# Booking Confirmation Email — Design Spec

**Date:** 2026-03-27
**Status:** SUPERSEDED — do not implement
**Superseded by:** Stripe webhook implementation (`confirmAppointmentPaid`) — landed in Terminal B
**Scope:** Minimal, isolated, production-safe

---

> **ARCHIVED — 2026-03-27**
>
> This spec is no longer active. Before this plan reached implementation, Terminal B delivered booking confirmation email triggered from the Stripe webhook after `confirmAppointmentPaid`. That is the canonical trigger point.
>
> Implementing this spec as written would introduce a second booking/email path (`POST /api/appointments`) that conflicts with the webhook-based architecture already in place. This spec is kept for reference only.

---

## Goal

After a customer successfully books an appointment, they receive a clean confirmation email. The email must feel real and trustworthy. It must never block or break booking success.

---

## What This Is Not

- Not a full notification system
- Not a reminder or cancellation flow
- Not an SMS implementation
- Not a second or parallel booking route

---

## Codebase Context

The `appointments` table exists in the schema and is read for availability checks, but has no insert path yet. The `provider_appointments` table handles Acuity-synced data separately and is out of scope here. There is no existing booking creation route. This spec introduces the single canonical booking route that will own both appointment creation and email triggering.

---

## Architecture

```
POST /api/appointments          ← single canonical booking path
  src/app/api/appointments/route.ts
  ├── Auth: verify Supabase session → customer user_id + email
  ├── Validate: barber_id, service_id, start_time, [notes]
  ├── Fetch service → duration_minutes → compute end_time
  ├── Fetch barber → confirm belongs to shop
  ├── Conflict check: no overlapping confirmed appointment for that barber/slot
  ├── INSERT into appointments (status: 'confirmed')
  ├── fire-and-forget: sendBookingConfirmation(params)
  │     ├── Resend API call
  │     ├── success → insert row to notifications table (status: 'sent')
  │     └── failure → insert row to notifications table (status: 'failed')
  │                 + console.error (never throws to caller)
  └── return 201 { appointment }
```

### Key rule

`src/app/api/appointments/route.ts` is the **only place in the codebase** that creates appointment records and triggers confirmation email. There is no second booking path, no parallel route, no server action that duplicates this responsibility. All future booking flows go through this route.

Email send and notification logging are both **non-blocking**. If either fails, the booking response returns successfully to the customer.

---

## New File: `src/lib/email/resend.ts`

Mirrors the shape and intent of `src/lib/sms/twilio.ts`.

**Exports:**

```ts
sendBookingConfirmation(params: BookingConfirmationParams): Promise<string>
// Returns Resend message ID. Throws on Resend error (caller must catch).
```

**Internals:**

```ts
getClient(): Resend
// Lazy factory. Throws at call time if RESEND_API_KEY is missing.

buildConfirmationHtml(params: BookingConfirmationParams): string
// Inline HTML. No external template engine.
```

**`BookingConfirmationParams` shape:**

```ts
type BookingConfirmationParams = {
  to: string             // customer email
  customerName: string
  barberName: string
  serviceName: string
  startTime: string      // ISO 8601
  shopName: string | null
  shopTimezone: string   // e.g. 'America/New_York' — sourced from shops.timezone
  appointmentId: string  // full UUID — display last 8 chars in email
}
```

---

## New File: `src/app/api/appointments/route.ts`

**Auth:** Requires active Supabase session. Customer `user_id` and `email` come from the session, not the request body.

**Request body:**

```ts
{
  barber_id: string
  service_id: string
  start_time: string   // ISO 8601
  notes?: string
}
```

**Response (201):**

```ts
{
  appointment: {
    id, shop_id, customer_id, barber_id, service_id,
    start_time, end_time, status, service_price, deposit_amount
  }
}
```

**Error responses:**
- `400` — validation failure (missing fields, bad time format)
- `401` — no active session
- `409` — barber already booked at that slot
- `500` — unexpected DB error

**Email trigger (inline, fire-and-forget):**

```ts
// After successful INSERT — never await at booking response level
sendBookingConfirmation({ ... }).catch((err) => {
  console.error('[email] booking confirmation failed:', err)
  // best-effort log to notifications table
})
```

Data assembled for email call:
- `to` — from Supabase session user email
- `customerName` — `users.first_name + last_name` (looked up by `customer_id`)
- `barberName` — `users.first_name + last_name` (looked up by `barber_id`)
- `serviceName` — `services.name` (looked up by `service_id`)
- `shopName` — `shops.name` (looked up by `shop_id`, nullable)
- `shopTimezone` — `shops.timezone`
- `startTime` — from appointment INSERT result
- `appointmentId` — from appointment INSERT result

---

## Email Content

**Subject:** `Your appointment is confirmed — {serviceName} with {barberName}`

**From:** `RESEND_FROM_EMAIL` env var (e.g. `bookings@yourshop.com`)

**Body (minimal clean HTML, no images):**

```
{Shop Name}                     ← omit line if shopName is null

Your appointment is confirmed.

Barber:   {First Last}
Service:  {Service Name}
Date:     {Friday, March 28, 2026}
Time:     {2:00 PM EST}          ← formatted in shop timezone

Reference: #{last 8 chars of UUID}
```

No marketing copy. No unsubscribe footer. No logo.

---

## Notifications Table Logging

Uses the existing `notifications` table. Each email attempt writes one row.

| Column              | Value                                      |
|---------------------|--------------------------------------------|
| `shop_id`           | from appointment                           |
| `user_id`           | customer user_id                           |
| `appointment_id`    | from appointment                           |
| `notification_type` | `'booking_confirmation'`                   |
| `channel`           | `'email'`                                  |
| `status`            | `'sent'` or `'failed'`                     |
| `subject`           | email subject string                       |
| `body_preview`      | first 200 chars of plain-text body         |
| `sent_at`           | timestamp on success, null on failure      |
| `error_message`     | null on success, error message on failure  |

Logging is best-effort. If the notification insert fails, it is logged to `console.error` only.

---

## Error Handling

| Failure point              | Behavior                                        |
|----------------------------|-------------------------------------------------|
| Resend API error           | Caught, logged, notifications row written       |
| Missing `RESEND_API_KEY`   | Throws at call time, caught by fire-and-forget  |
| Notification insert fails  | console.error only, booking unaffected          |
| Appointment INSERT fails   | Email never fires — booking fails normally      |

---

## ENV Vars Required

```env
RESEND_API_KEY=          # from resend.com dashboard
RESEND_FROM_EMAIL=       # verified sender, e.g. bookings@yourshop.com
```

---

## Dependencies

Add to `package.json`:

```
"resend": "^4.x"
```

---

## Files Summary

| Action   | File                                        |
|----------|---------------------------------------------|
| Create   | `src/lib/email/resend.ts`                   |
| Create   | `src/app/api/appointments/route.ts`         |
| Modify   | `package.json` (add `resend`)               |

---

## Out of Scope

- Reminder emails (24h, 1h before appointment)
- Cancellation confirmation email
- SMS confirmation (Twilio wired separately, not triggered here)
- Email preference settings
- Unsubscribe / opt-out logic
- HTML email design system or template engine
- Payment processing (separate workstream)
- OTP auth UI (Supabase handles customer auth)
