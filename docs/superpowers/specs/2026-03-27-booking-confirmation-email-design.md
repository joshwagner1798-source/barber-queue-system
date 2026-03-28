# Booking Confirmation Email — Design Spec

**Date:** 2026-03-27
**Status:** Approved for implementation
**Scope:** Minimal, isolated, production-safe

---

## Goal

After a customer successfully books an appointment, they receive a clean confirmation email. The email must feel real and trustworthy. It must never block or break booking success.

---

## What This Is Not

- Not a full notification system
- Not a reminder or cancellation flow
- Not an SMS implementation
- Not a new booking creation route

---

## Architecture

```
[Existing booking success path]
  └── on successful appointment INSERT
        └── fire-and-forget: sendBookingConfirmation(params)
              ├── Resend API call
              ├── success → insert row to notifications table (status: 'sent')
              └── failure → insert row to notifications table (status: 'failed')
                          + console.error (never throws to caller)
```

### Key rule

Email is triggered **from within the existing booking flow**, at the point an appointment is confirmed in the database. The trigger is not a new route or parallel path. Implementation will locate the exact hook point in the booking success path.

Email send and notification logging are both **non-blocking**. If either fails, the booking response returns successfully to the customer.

---

## New Files

### `src/lib/email/resend.ts`

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
  shopTimezone: string   // e.g. 'America/New_York'
  appointmentId: string  // full UUID — display last 8 chars in email
}
```

---

## Modified Files

### Existing booking success path

One addition only: after the appointment INSERT succeeds, call `sendBookingConfirmation` in a fire-and-forget wrapper.

```ts
// fire-and-forget — never await at the top level
sendBookingConfirmation({ ... }).catch((err) => {
  console.error('[email] booking confirmation failed:', err)
  // log to notifications table (best-effort)
})
```

The booking response is returned immediately after the DB insert, before email completes.

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

Uses the existing `notifications` table (already in schema). Each email attempt writes one row.

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

Logging is best-effort. If the notification insert itself fails, it is logged to `console.error` only — it does not affect the email send result or the booking response.

---

## Error Handling

| Failure point              | Behavior                                        |
|----------------------------|-------------------------------------------------|
| Resend API error           | Caught, logged, notifications row written       |
| Missing `RESEND_API_KEY`   | Throws at call time, caught by fire-and-forget  |
| Notification insert fails  | console.error only, booking unaffected          |
| Appointment insert fails   | Email never fires — booking fails normally      |

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

No other new dependencies.

---

## Files Summary

| Action   | File                                        |
|----------|---------------------------------------------|
| Create   | `src/lib/email/resend.ts`                   |
| Modify   | Existing booking success path (hook point)  |
| Modify   | `package.json` (add `resend`)               |

---

## Out of Scope

- Reminder emails (24h, 1h before appointment)
- Cancellation confirmation email
- SMS confirmation (Twilio wired separately, not triggered here)
- Email preference settings
- Unsubscribe / opt-out logic
- HTML email design system or template engine
