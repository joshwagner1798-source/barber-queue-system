# Deployment Guide — barber_scheduling

This document lists every environment variable required for a successful Vercel
production deployment and explains how each one is used.

---

## Required Environment Variables

### Supabase

| Variable | Scope | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (client + server) | Yes | Your Supabase project URL, e.g. `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (client + server) | Yes | Supabase anon/public key — safe to expose in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes | Service role key — **never expose to the client**. Used by all admin API routes. |

### Shop Identity

| Variable | Scope | Required | Description |
|---|---|---|---|
| `DEFAULT_SHOP_ID` | Server only | Yes (if no `?shop_id` param) | UUID of the default shop. Used as a fallback when API routes are called without an explicit `?shop_id=` query param. Should be set in Vercel environment variables — never hard-coded in source. |

### Reconcile / Cron

| Variable | Scope | Required | Description |
|---|---|---|---|
| `RECONCILE_SECRET` | Server only | Yes | Bearer token for `GET /api/jobs/reconcile-acuity`. Use a long random string. |
| `CRON_SECRET` | Server only | No | Alternative bearer token accepted by the reconcile job. Vercel injects this automatically when configured as a cron job. |

### Acuity Scheduling

| Variable | Scope | Required | Description |
|---|---|---|---|
| `ACUITY_USER_ID` | Server only | Yes | Your Acuity account user ID (numeric). |
| `ACUITY_API_KEY` | Server only | Yes | Acuity API key. Never expose to the client. |

### Public URL

| Variable | Scope | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Optional | No | The public production domain, e.g. `https://my-shop.vercel.app`. Used as a fallback when building URLs outside of a request context. **Must** be set to `https://<production-domain>` if used — **not** `http://localhost:3000`. In production, the server derives the base URL from `x-forwarded-proto` + `x-forwarded-host` headers, so this variable is only a fallback. |

---

## How URL Resolution Works in Production

The helpers in `src/lib/url.ts` derive the public base URL from the incoming
request headers (`x-forwarded-proto` + `x-forwarded-host`), which Vercel sets
correctly on every request. `NEXT_PUBLIC_SITE_URL` is only used as a fallback
for code that runs outside of a request context (e.g. build-time utilities).

This means:
- You do **not** need `NEXT_PUBLIC_SITE_URL` set for TV/kiosk links to use the
  correct production domain.
- If you set `NEXT_PUBLIC_SITE_URL`, make sure it matches your actual Vercel
  domain exactly (including `https://`).

---

## How Shop ID Resolution Works

All server-side API routes (`/api/tv`, `/api/kiosk/barbers`, etc.) resolve the
active shop using `src/lib/shop-resolver.ts`:

1. `?shop_id=<uuid>` query parameter — highest priority, explicit.
2. `DEFAULT_SHOP_ID` environment variable — server-only fallback.

Client-side pages (`/tv`, `/kiosk`, `/tv-display`) read `?shop_id=` from the
URL and pass it down to client components, which include it in all API calls.

---

## Share Links

The dashboard's **Owner Settings** tab shows copy-able TV and Kiosk links that
include the correct production domain (derived from `window.location.origin`)
and the shop ID. These are always correct regardless of the deployment domain.

---

## Vercel Cron Job (Reconcile)

Add the following to `vercel.json` (or Vercel dashboard > Cron Jobs):

```json
{
  "crons": [
    {
      "path": "/api/jobs/reconcile-acuity?shop_id=<YOUR_DEFAULT_SHOP_ID>",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Vercel will inject `CRON_SECRET` as a header automatically, which the route
accepts as a valid bearer token.

---

## Fail-Fast Validation

The following API routes validate that required environment variables are set
and return `500 { error: "Server misconfiguration", missing: [...] }` if any
are absent:

- `GET /api/tv`
- `GET /api/kiosk/barbers`

This prevents silent data corruption from using wrong/empty credentials.

---

## Test Checklist (Production)

```bash
# TV display — should show barbers + queue
curl -s "https://<your-domain>/api/tv?shop_id=<DEFAULT_SHOP_ID>" | jq '.barbers | length'

# Kiosk barbers
curl -s "https://<your-domain>/api/kiosk/barbers?shop_id=<DEFAULT_SHOP_ID>" | jq '.'

# Reconcile status (no auth needed)
curl -s "https://<your-domain>/api/debug/reconcile-status?shop_id=<DEFAULT_SHOP_ID>" | jq '.'

# Run reconcile manually
curl -i "https://<your-domain>/api/jobs/reconcile-acuity?shop_id=<DEFAULT_SHOP_ID>" \
  -H "Authorization: Bearer <RECONCILE_SECRET>"
```
