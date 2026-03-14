# TODO List

## How to Use This List
- [ ] = Not started
- [x] = Done
- [~] = In progress (change to [x] when done)

---

## Phase 1: Foundation (Get the app running)

### Setup
- [x] Create Next.js project with TypeScript
- [x] Install Tailwind CSS
- [x] Install Supabase libraries
- [ ] Create `.env.local` file with API keys
- [ ] Set up Supabase project (cloud or local)
- [ ] Run database migrations (create tables)
- [ ] Run seed file (add test data)

### Authentication
- [x] Create login page (`/login`)
- [x] Create signup page (`/signup`)
- [x] Create forgot password page (`/forgot-password`)
- [x] Create auth callback route (`/auth/callback`)
- [ ] Create middleware (protect routes)
- [ ] Test: Can sign up new user
- [ ] Test: Can log in
- [ ] Test: Can reset password

---

## Phase 2: Booking Flow (Main feature!)

### Components to Build
- [ ] `BarberSelector` - Grid of barber cards
- [ ] `ServiceSelector` - List of services with prices
- [ ] `TimeSlotPicker` - Calendar + time buttons
- [ ] `BookingSummary` - Shows what customer picked
- [ ] `BookingConfirmation` - Success message

### API Routes to Build
- [ ] `GET /api/services` - List all services
- [ ] `GET /api/barbers` - List all barbers
- [ ] `GET /api/availability` - Get open time slots
- [ ] `POST /api/appointments` - Create booking
- [ ] `GET /api/appointments` - List user's bookings
- [ ] `PATCH /api/appointments/[id]` - Update booking
- [ ] `DELETE /api/appointments/[id]` - Cancel booking

### Pages to Build
- [ ] `/book` - Booking wizard (multi-step)
- [ ] `/book/confirm` - Review and pay
- [ ] `/appointments` - My appointments list
- [ ] `/appointments/[id]` - Single appointment detail

### Testing
- [ ] Test: Can see list of barbers
- [ ] Test: Can see list of services
- [ ] Test: Can see available time slots
- [ ] Test: Can complete booking (without payment)
- [ ] Test: Can view my appointments
- [ ] Test: Can cancel appointment

---

## Phase 3: Payments (Stripe)

### Setup
- [ ] Create Stripe account
- [ ] Get test API keys
- [ ] Add keys to `.env.local`
- [ ] Install Stripe libraries

### Build
- [ ] `PaymentForm` component (card input)
- [ ] `POST /api/payments/create-intent` route
- [ ] `POST /api/payments/webhook` route
- [ ] Connect payment to booking flow
- [ ] Handle payment success
- [ ] Handle payment failure

### Testing
- [ ] Test: Can enter card (use 4242 4242 4242 4242)
- [ ] Test: Payment succeeds and appointment confirms
- [ ] Test: Failed payment shows error

---

## Phase 4: Admin Dashboard

### Pages
- [ ] `/admin/dashboard` - Stats overview
- [ ] `/admin/calendar` - Calendar view of appointments
- [ ] `/admin/appointments` - List all appointments
- [ ] `/admin/services` - Manage services (add/edit/delete)
- [ ] `/admin/barbers` - Manage barbers
- [ ] `/admin/schedule` - Set business hours

### Components
- [ ] `AdminSidebar` - Navigation
- [ ] `StatsCard` - Show metrics
- [ ] `CalendarView` - Week/month calendar
- [ ] `ServiceForm` - Add/edit service
- [ ] `BarberForm` - Add/edit barber
- [ ] `HoursEditor` - Set open/close times

---

## Phase 5: Notifications

- [ ] Set up Resend account
- [ ] Create email templates
- [ ] Send booking confirmation email
- [ ] Send 24-hour reminder email
- [ ] Send cancellation email
- [ ] Set up cron job for reminders

---

## Phase 6: Launch

- [ ] Test on mobile devices
- [ ] Fix any responsive issues
- [ ] Add loading spinners everywhere
- [ ] Add error messages everywhere
- [ ] Deploy to Vercel
- [ ] Set up production environment variables
- [ ] Test production site
- [ ] Share with shop owner for feedback

---

## Bugs to Fix
<!-- Add bugs here as you find them -->

---

## Ideas for Later
- [ ] SMS notifications
- [ ] Google Calendar sync
- [ ] Online reviews
- [ ] Loyalty points
- [ ] Multi-shop support
