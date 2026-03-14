# Database Design

## Entity Relationship Diagram

```
┌─────────┐
│  shops  │
└────┬────┘
     │
     ├──────────────┬──────────────┬──────────────┬──────────────┐
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
┌─────────┐   ┌──────────┐  ┌───────────────┐ ┌────────────┐ ┌─────────────┐
│  users  │   │ services │  │business_hours │ │time_blocks │ │appointments │
└────┬────┘   └────┬─────┘  └───────────────┘ └────────────┘ └──────┬──────┘
     │              │                                               │
     │              │                                               │
     ▼              ▼                                               ▼
┌────────────────────┐                                        ┌──────────┐
│  barber_services   │                                        │ payments │
└────────────────────┘                                        └──────────┘
```

---

## Tables

### shops
Core shop configuration. Designed for multi-tenant but single shop initially.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Shop name |
| slug | VARCHAR(100) | URL-friendly identifier |
| address | TEXT | Physical address |
| phone | VARCHAR(20) | Contact phone |
| email | VARCHAR(255) | Contact email |
| timezone | VARCHAR(50) | Default: America/New_York |
| booking_lead_time_minutes | INT | Min time before booking (60) |
| booking_window_days | INT | How far ahead can book (30) |
| cancellation_policy_hours | INT | Free cancel window (24) |
| deposit_percentage | DECIMAL | Deposit % of service price |
| require_deposit | BOOLEAN | Force deposits |

### users
All user types in single table with role differentiation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| shop_id | UUID | FK to shops |
| auth_id | UUID | Links to Supabase auth.users |
| email | VARCHAR(255) | Email address |
| first_name | VARCHAR(100) | First name |
| last_name | VARCHAR(100) | Last name |
| phone | VARCHAR(20) | Phone number |
| role | VARCHAR(20) | customer/barber/admin/owner |
| bio | TEXT | Barber bio |
| specialties | TEXT[] | Barber specialties array |
| is_active | BOOLEAN | For barbers |
| display_order | INT | Ordering in UI |

### services
Available services with pricing.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| shop_id | UUID | FK to shops |
| name | VARCHAR(100) | Service name |
| description | TEXT | Description |
| duration_minutes | INT | How long it takes |
| price | DECIMAL(10,2) | Price |
| category | VARCHAR(50) | haircut/beard/combo/specialty |
| is_active | BOOLEAN | Show in booking |
| display_order | INT | Ordering in UI |

### appointments
Core booking records.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| shop_id | UUID | FK to shops |
| customer_id | UUID | FK to users (customer) |
| barber_id | UUID | FK to users (barber) |
| service_id | UUID | FK to services |
| start_time | TIMESTAMPTZ | Appointment start |
| end_time | TIMESTAMPTZ | Appointment end |
| service_price | DECIMAL | Price snapshot |
| deposit_amount | DECIMAL | Deposit paid |
| status | VARCHAR(20) | pending/confirmed/completed/cancelled/no_show |
| notes | TEXT | Customer notes |
| cancelled_at | TIMESTAMPTZ | When cancelled |
| cancellation_reason | TEXT | Why cancelled |

### payments
Stripe payment tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| appointment_id | UUID | FK to appointments |
| stripe_payment_intent_id | VARCHAR(255) | Stripe PI ID |
| stripe_charge_id | VARCHAR(255) | Stripe charge ID |
| amount | DECIMAL(10,2) | Payment amount |
| status | VARCHAR(20) | pending/succeeded/failed/refunded |
| payment_type | VARCHAR(30) | deposit/full_payment/remaining_balance |
| refunded_amount | DECIMAL | Amount refunded |

### business_hours
Weekly schedule.

| Column | Type | Description |
|--------|------|-------------|
| shop_id | UUID | FK to shops |
| barber_id | UUID | FK to users (nullable = shop-wide) |
| day_of_week | INT | 0=Sunday, 6=Saturday |
| open_time | TIME | Opening time |
| close_time | TIME | Closing time |
| is_closed | BOOLEAN | Closed this day |

### time_blocks
Breaks, time off, special availability.

| Column | Type | Description |
|--------|------|-------------|
| shop_id | UUID | FK to shops |
| barber_id | UUID | FK to users (nullable) |
| block_type | VARCHAR(20) | break/time_off/available |
| title | VARCHAR(100) | Block description |
| start_datetime | TIMESTAMPTZ | Block start |
| end_datetime | TIMESTAMPTZ | Block end |
| recurrence_rule | TEXT | iCal RRULE format |

---

## Row Level Security

### Key Policies
- **shops**: Anyone can read, only owner can update
- **users**: Public can see barbers, users see own profile, admin sees all
- **services**: Anyone reads active services, admin manages
- **appointments**: Customers see own, barbers see assigned, admin sees all
- **payments**: Users see payments for their appointments

### Helper Functions
```sql
get_user_shop_id() -- Returns current user's shop_id
is_admin_or_owner() -- Returns true if user is admin/owner
get_current_user_id() -- Returns current user's id from users table
```

---

## Indexes
- `idx_users_auth_id` - Fast auth lookups
- `idx_users_shop_role` - Filter users by shop and role
- `idx_appointments_shop_date` - Calendar queries
- `idx_appointments_barber_date` - Barber schedule view
- `idx_payments_stripe` - Webhook lookups

---

## Migration Files
1. `00001_initial_schema.sql` - All tables, indexes, triggers
2. `00002_rls_policies.sql` - Row Level Security
3. `seed.sql` - Test shop, services, business hours
