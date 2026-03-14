# Tech Stack Decisions

## Frontend

### Next.js 14 (App Router)
**Why:**
- Server components for better performance
- Built-in API routes
- Easy Vercel deployment
- React Server Components reduce client bundle

**Alternatives considered:**
- Remix - Good, but less ecosystem support
- Plain React + Vite - Would need separate backend

### TypeScript
**Why:**
- Type safety prevents bugs
- Better IDE support
- Self-documenting code
- Required for serious production apps

### Tailwind CSS
**Why:**
- Rapid development
- No CSS files to manage
- Consistent design system
- Great responsive utilities

**Alternatives considered:**
- CSS Modules - More boilerplate
- Styled Components - Runtime overhead

---

## Backend

### Supabase
**Why:**
- PostgreSQL database (scalable, reliable)
- Built-in authentication
- Row Level Security for authorization
- Real-time subscriptions (future feature)
- Generous free tier
- Easy local development

**Alternatives considered:**
- Firebase - NoSQL limits complex queries
- PlanetScale - No built-in auth
- Custom backend - More work, same result

### Stripe
**Why:**
- Industry standard for payments
- PayPal integration built-in
- Excellent documentation
- Webhook reliability
- PCI compliance handled

**Alternatives considered:**
- Square (for online) - Already using for in-person
- PayPal direct - Less features

---

## Hosting

### Vercel
**Why:**
- Built for Next.js
- Automatic deployments from Git
- Edge functions
- Great free tier
- Preview deployments

**Alternatives considered:**
- Netlify - Good, but Next.js native is better
- AWS Amplify - More complex setup
- Self-hosted - Maintenance burden

---

## Email

### Resend (Planned)
**Why:**
- Modern API
- React Email for templates
- 3000 emails/month free
- Great developer experience

**Alternatives considered:**
- SendGrid - Works, but dated API
- AWS SES - Complex setup
- Postmark - More expensive

---

## Key Libraries

| Library | Purpose |
|---------|---------|
| `@supabase/ssr` | Supabase client for Next.js App Router |
| `@stripe/stripe-js` | Stripe frontend SDK |
| `stripe` | Stripe backend SDK |
| `date-fns` | Date manipulation |
| `zod` | Schema validation |
| `react-hook-form` | Form handling |

---

## Architecture Decisions

### Single Table for Users
Instead of separate `customers` and `barbers` tables, using single `users` table with `role` field.

**Pros:**
- Simpler queries
- Barber can also be customer
- Single auth flow

**Cons:**
- Some nullable fields (barber-specific)
- Slightly denormalized

### Multi-tenant Ready
All tables have `shop_id` even though single shop initially.

**Why:**
- Future-proofing
- No migration needed later
- RLS policies already scoped

### Appointment Price Snapshot
Store `service_price` on appointment, not just reference to service.

**Why:**
- Price can change after booking
- Historical accuracy
- No joins for invoice

### Soft Delete for Services
Use `is_active` flag instead of deleting services.

**Why:**
- Historical appointments reference them
- Can reactivate later
- Audit trail

---

## Performance Considerations

### Database Indexes
Created indexes on:
- `appointments(barber_id, start_time)` - Calendar queries
- `appointments(shop_id, start_time)` - Admin views
- `users(auth_id)` - Auth lookups
- `payments(stripe_payment_intent_id)` - Webhook handling

### Caching Strategy (Future)
- Cache availability calculation results
- Cache service list
- Use SWR/React Query on frontend

---

## Security

### Row Level Security
All authorization handled at database level.
- No accidental data leaks
- Works across all access patterns

### Environment Variables
Sensitive keys stored in:
- `.env.local` (local dev)
- Vercel environment variables (production)

Never committed to Git.
