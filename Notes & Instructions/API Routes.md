# API Routes

## Authentication

### `POST /auth/callback`
Handles Supabase auth callback after email confirmation or OAuth.

---

## Appointments

### `GET /api/appointments`
List appointments with filters.

**Query params:**
- `status` - Filter by status
- `barberId` - Filter by barber
- `startDate` - Start of date range
- `endDate` - End of date range
- `customerId` - Filter by customer

**Response:**
```json
{
  "data": [Appointment],
  "meta": { "total": 50, "page": 1, "limit": 20 }
}
```

### `POST /api/appointments`
Create new appointment.

**Body:**
```json
{
  "barberId": "uuid",
  "serviceId": "uuid",
  "startTime": "2026-01-20T10:00:00Z",
  "notes": "optional notes"
}
```

### `GET /api/appointments/[id]`
Get single appointment details.

### `PATCH /api/appointments/[id]`
Update appointment (status, notes).

### `DELETE /api/appointments/[id]`
Cancel appointment.

---

## Availability

### `GET /api/availability`
Get available time slots.

**Query params:**
- `barberId` - Required
- `serviceId` - Required
- `date` - Date to check (YYYY-MM-DD)
- `endDate` - Optional end of range

**Response:**
```json
{
  "data": [
    {
      "date": "2026-01-20",
      "slots": [
        { "time": "09:00", "available": true },
        { "time": "09:30", "available": false },
        { "time": "10:00", "available": true }
      ]
    }
  ]
}
```

---

## Services

### `GET /api/services`
List all active services.

**Query params:**
- `active` - Filter by active status (default: true)

### `POST /api/services`
Create new service (admin only).

**Body:**
```json
{
  "name": "Classic Haircut",
  "description": "Traditional cut with precision",
  "durationMinutes": 30,
  "price": 25.00,
  "category": "haircut"
}
```

### `PATCH /api/services/[id]`
Update service (admin only).

### `DELETE /api/services/[id]`
Deactivate service (admin only).

---

## Barbers

### `GET /api/barbers`
List all barbers.

**Query params:**
- `active` - Filter by active status

### `POST /api/barbers`
Create new barber (admin only).

### `PATCH /api/barbers/[id]`
Update barber (admin only).

---

## Payments

### `POST /api/payments/create-intent`
Create Stripe PaymentIntent for booking.

**Body:**
```json
{
  "appointmentId": "uuid",
  "paymentType": "deposit" | "full"
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "amount": 25.00
}
```

### `POST /api/payments/webhook`
Stripe webhook handler.

**Events handled:**
- `payment_intent.succeeded` - Confirm appointment
- `payment_intent.payment_failed` - Mark payment failed
- `charge.refunded` - Handle refunds

---

## Business Hours

### `GET /api/business-hours`
Get shop/barber hours.

**Query params:**
- `barberId` - Optional, get specific barber's hours

### `PUT /api/business-hours`
Update hours (admin only).

**Body:**
```json
{
  "hours": [
    {
      "dayOfWeek": 1,
      "openTime": "09:00",
      "closeTime": "19:00",
      "isClosed": false
    }
  ]
}
```

---

## Time Blocks

### `POST /api/time-blocks`
Create break/time-off block.

**Body:**
```json
{
  "barberId": "uuid",
  "blockType": "break" | "time_off",
  "title": "Lunch Break",
  "startDatetime": "2026-01-20T12:00:00Z",
  "endDatetime": "2026-01-20T13:00:00Z"
}
```

### `DELETE /api/time-blocks/[id]`
Remove time block.

---

## Response Format

All endpoints return consistent JSON structure:

**Success:**
```json
{
  "data": { ... },
  "meta": { ... }  // optional pagination
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Authentication

All routes except public ones require authentication via Supabase.
- Auth token passed via cookies (set by Supabase SSR)
- Admin routes check user role via RLS

---

## Rate Limiting
Consider implementing rate limiting for:
- `/api/availability` - Prevent abuse
- `/api/appointments` POST - Prevent spam bookings
- `/api/payments/*` - Security
