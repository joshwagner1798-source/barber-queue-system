# Getting Started

## First Time Setup (Do Once)

### Step 1: Install Node.js
If you don't have Node.js installed:
1. Go to https://nodejs.org
2. Download the LTS version
3. Install it
4. Restart your terminal

Check it worked:
```bash
node --version
# Should show something like v18.x.x or v20.x.x
```

### Step 2: Install Dependencies
```bash
cd "E:\Coding Projects\Barber_Scheduling_Tool"
npm install
```

### Step 3: Create Environment File
Create a file called `.env.local` in the project root:

```bash
# Windows Command Prompt
copy NUL .env.local

# Or PowerShell
New-Item .env.local
```

Open it in any text editor and paste:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Stripe (add later when doing payments)
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Set Up Supabase

1. Go to https://supabase.com
2. Sign up / Log in
3. Click "New Project"
4. Fill in:
   - Name: `barber-scheduling`
   - Password: (save this somewhere!)
   - Region: Choose closest to you
5. Wait for project to create (~2 minutes)
6. Go to **Project Settings** → **API**
7. Copy these values to your `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 5: Create Database Tables

1. In Supabase, click **SQL Editor**
2. Click **New Query**
3. Open `supabase/migrations/00001_initial_schema.sql` from the project
4. Copy ALL the contents
5. Paste into Supabase SQL Editor
6. Click **Run**
7. Should say "Success. No rows returned"

Repeat for:
- `supabase/migrations/00002_rls_policies.sql`
- `supabase/seed.sql`

### Step 6: Run the App!
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

You should see the barbershop landing page!

---

## Daily Development (Do Every Time)

```bash
# 1. Open terminal
cd "E:\Coding Projects\Barber_Scheduling_Tool"

# 2. Start the app
npm run dev

# 3. Open browser to http://localhost:3000

# 4. Edit code - page auto-refreshes!

# 5. When done, press Ctrl+C to stop
```

---

## Quick Reference

| What | Command |
|------|---------|
| Start app | `npm run dev` |
| Stop app | `Ctrl + C` |
| Check for errors | `npm run lint` |
| Build production | `npm run build` |
| Install new package | `npm install package-name` |

---

## Project URLs (When Running)

| Page | URL |
|------|-----|
| Homepage | http://localhost:3000 |
| Login | http://localhost:3000/login |
| Sign Up | http://localhost:3000/signup |
| Forgot Password | http://localhost:3000/forgot-password |

---

## Common Issues

### "npm is not recognized"
→ Node.js not installed. Go to https://nodejs.org

### "ENOENT: no such file or directory"
→ You're in the wrong folder. Run:
```bash
cd "E:\Coding Projects\Barber_Scheduling_Tool"
```

### Blank page / nothing loads
→ Check terminal for red error messages
→ Make sure `.env.local` exists with Supabase keys

### "Invalid API key"
→ Check your Supabase keys in `.env.local` are correct
→ No extra spaces or quotes around the values

### Changes not showing
→ Hard refresh: `Ctrl + Shift + R`
→ Or restart: `Ctrl + C` then `npm run dev`

---

## Next Steps

Once the app is running, check [[TODO]] for what to build next!
