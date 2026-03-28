# Barber Scheduling Tool

## Project Status
**Status:** In Development
**Started:** January 2026
**Tech Stack:** Next.js 14 + TypeScript + Tailwind + Supabase + Stripe

---

## Quick Links
- **Code:** `E:\Coding Projects\Barber_Scheduling_Tool`
- **Dev Server:** http://localhost:3000
- **Supabase Dashboard:** https://supabase.com/dashboard (need to set up project)

---

## Overview
A web-based appointment booking system for a barbershop. Customers can:
- Browse available barbers and services
- Select time slots based on real-time availability
- Pay deposits or full amounts via Stripe
- Manage their appointments

Shop owner/admin can:
- View all appointments in calendar view
- Manage services and pricing
- Set business hours and barber schedules
- Track revenue and booking history

---

## Implementation Phases

### Phase 1: Foundation ✅
- [x] Next.js project setup
- [x] Database schema (9 tables)
- [x] Row Level Security policies
- [x] Auth pages (login, signup, forgot password)
- [ ] Middleware for route protection
- [ ] Environment setup

### Phase 2: Booking Flow
- [ ] Landing page enhancements
- [ ] Barber selection
- [ ] Service selection
- [ ] Time slot picker
- [ ] Availability calculation logic
- [ ] Booking confirmation
- [ ] My Appointments page

### Phase 3: Payments
- [ ] Stripe integration
- [ ] PaymentIntent API
- [ ] Webhook handler
- [ ] Deposit vs full payment options

### Phase 4: Admin Dashboard
- [ ] Dashboard with stats
- [ ] Calendar view
- [ ] Services CRUD
- [ ] Barbers management
- [ ] Business hours editor

### Phase 5: Notifications
- [ ] Email provider setup (Resend)
- [x] Booking confirmation emails
- [ ] Reminder emails (24h, 1h)
- [ ] Cancellation notifications

#### Architecture decision — booking confirmation email (2026-03-27)
- **Trigger point:** Stripe webhook handler, after `confirmAppointmentPaid` succeeds
- **Why:** Payment success is the moment the booking is considered real. Triggering from the webhook ensures the email fires exactly once, after money is confirmed, from a single authoritative path.
- **Do not add a second trigger.** No other route, server action, or booking path should send a booking confirmation email. If you are working on the booking or payment flow and feel tempted to add an email call elsewhere, check the Stripe webhook handler first.

### Phase 6: Launch
- [ ] Mobile responsiveness
- [ ] Error handling
- [ ] Vercel deployment
- [ ] Production environment

---

## Database Schema

```
shops
├── users (customers, barbers, admins)
├── services
├── business_hours
├── time_blocks
├── appointments
│   ├── payments
│   └── notifications
└── barber_services
```

### Key Tables
| Table | Purpose |
|-------|---------|
| `shops` | Shop configuration, settings |
| `users` | All user types with role field |
| `services` | Haircut, beard, etc. with prices |
| `appointments` | Core bookings |
| `payments` | Stripe payment records |
| `business_hours` | Weekly schedule |
| `time_blocks` | Breaks, time off |

---

## Environment Variables Needed

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run Supabase locally
npx supabase start

# Apply migrations
npx supabase db push
```

---

## Notes
- Square will be used separately for in-person payments (no integration needed)
- Architecture supports multi-tenant (shop_id on all tables) for future scaling
- Single shop for initial launch

---

## Documentation Index

### Start Here
- [[Getting Started]] - First time setup instructions
- [[TODO]] - What needs to be done (checklist)
- [[Workflow Guide]] - How to work on this project

### Reference
- [[Tech Stack Decisions]] - Why we chose each technology
- [[Database Design]] - Tables, relationships, RLS policies
- [[API Routes]] - All backend endpoints
