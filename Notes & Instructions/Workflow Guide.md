# Workflow Guide

## For Humans Picking Up This Project

This guide explains how the app works and how to continue building it.

---

## Quick Start (5 minutes)

```bash
# 1. Open terminal, go to project
cd "E:\Coding Projects\Barber_Scheduling_Tool"

# 2. Install dependencies (if needed)
npm install

# 3. Start dev server
npm run dev

# 4. Open browser
# Go to http://localhost:3000
```

---

## Project Structure (Where stuff lives)

```
Barber_Scheduling_Tool/
│
├── src/
│   ├── app/                    ← PAGES LIVE HERE
│   │   ├── page.tsx            ← Homepage (localhost:3000)
│   │   ├── (auth)/             ← Login, signup pages
│   │   ├── (customer)/         ← Booking pages (TODO)
│   │   ├── (admin)/            ← Admin dashboard (TODO)
│   │   └── api/                ← Backend API routes
│   │
│   ├── components/             ← REUSABLE UI PIECES
│   │   ├── ui/                 ← Buttons, inputs, cards
│   │   ├── booking/            ← Booking-specific (TODO)
│   │   └── admin/              ← Admin-specific (TODO)
│   │
│   ├── lib/                    ← HELPER CODE
│   │   ├── supabase/           ← Database connection
│   │   ├── stripe/             ← Payment code (TODO)
│   │   └── availability/       ← Time slot logic (TODO)
│   │
│   └── types/                  ← TypeScript definitions
│       └── database.ts         ← What data looks like
│
├── supabase/
│   ├── migrations/             ← Database setup files
│   └── seed.sql                ← Test data
│
└── .env.local                  ← Secret API keys (you create this)
```

---

## How the App Works (Big Picture)

```
CUSTOMER FLOW:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Visit   │ →  │  Pick    │ →  │  Pick    │ →  │  Pick    │
│  Website │    │  Barber  │    │  Service │    │  Time    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                                                      ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Done!   │ ←  │  Pay     │ ←  │  Review  │ ←  │  Login/  │
│  Email   │    │  (Stripe)│    │  Booking │    │  Signup  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘


ADMIN FLOW:
┌──────────┐    ┌──────────────────────────────────────────┐
│  Login   │ →  │  Dashboard                               │
│  as Admin│    │  - See today's appointments              │
└──────────┘    │  - View calendar                         │
                │  - Manage services & prices              │
                │  - Set business hours                    │
                └──────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Pages vs Components

**Pages** = Full screens users visit (like `/login` or `/book`)
- Live in `src/app/` folder
- File named `page.tsx` = the page content
- Folder name = URL path

**Components** = Reusable pieces (like a button or card)
- Live in `src/components/` folder
- Used inside pages
- Example: `<Button>` component used on many pages

### 2. API Routes

Backend code that talks to the database.

- Live in `src/app/api/` folder
- File named `route.ts`
- Example: `src/app/api/services/route.ts` → `GET /api/services`

### 3. Database (Supabase)

All data stored in PostgreSQL via Supabase.

**Main tables:**
| Table | What it stores |
|-------|---------------|
| `shops` | Shop info (name, hours, settings) |
| `users` | Customers, barbers, admins |
| `services` | Haircut, beard trim, etc. |
| `appointments` | Bookings |
| `payments` | Stripe payment records |

### 4. Authentication (Login System)

Uses Supabase Auth.
- Users sign up with email/password
- Session stored in cookies
- Middleware checks if logged in

---

## How to Add a New Page

Example: Add a "Contact Us" page at `/contact`

```bash
# 1. Create folder and file
mkdir src/app/contact
# 2. Create page.tsx inside it
```

```tsx
// src/app/contact/page.tsx
export default function ContactPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Contact Us</h1>
      <p>Email: info@barbershop.com</p>
    </div>
  )
}
```

Now visit `http://localhost:3000/contact`

---

## How to Add a New Component

Example: Create a "ServiceCard" component

```tsx
// src/components/booking/ServiceCard.tsx
interface ServiceCardProps {
  name: string
  price: number
  duration: number
  onSelect: () => void
}

export function ServiceCard({ name, price, duration, onSelect }: ServiceCardProps) {
  return (
    <div
      className="border rounded-lg p-4 cursor-pointer hover:border-blue-500"
      onClick={onSelect}
    >
      <h3 className="font-bold">{name}</h3>
      <p>${price} • {duration} min</p>
    </div>
  )
}
```

Use it in a page:
```tsx
import { ServiceCard } from '@/components/booking/ServiceCard'

// Inside your page:
<ServiceCard
  name="Haircut"
  price={25}
  duration={30}
  onSelect={() => console.log('Selected!')}
/>
```

---

## How to Add an API Route

Example: Create endpoint to get all services

```ts
// src/app/api/services/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('display_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
```

Test it: `http://localhost:3000/api/services`

---

## Common Tasks

### Run the app
```bash
npm run dev
```

### Check for errors
```bash
npm run lint
```

### Build for production
```bash
npm run build
```

### See what's in the database
1. Go to Supabase dashboard
2. Click "Table Editor"
3. Browse tables

### Add test data
1. Go to Supabase dashboard
2. Click "SQL Editor"
3. Paste and run queries from `supabase/seed.sql`

---

## Troubleshooting

### "Module not found" error
```bash
npm install
```

### Page not updating
- Hard refresh: `Ctrl + Shift + R`
- Or restart dev server: `Ctrl + C` then `npm run dev`

### Database connection error
- Check `.env.local` has correct Supabase URL and keys
- Make sure Supabase project is running

### TypeScript errors
```bash
npx tsc --noEmit
```
This shows all type errors without building.

---

## Files You'll Edit Most

| Task | File(s) |
|------|---------|
| Change homepage | `src/app/page.tsx` |
| Add new page | `src/app/[folder]/page.tsx` |
| Add component | `src/components/[folder]/[Name].tsx` |
| Add API route | `src/app/api/[route]/route.ts` |
| Change database | `supabase/migrations/` |
| Update types | `src/types/database.ts` |
| Change styles | Component files (Tailwind classes) |

---

## Need Help?

1. Check [[TODO]] for what needs doing
2. Check [[API Routes]] for backend reference
3. Check [[Database Design]] for data structure
4. Check [[Tech Stack Decisions]] for why things are built this way
