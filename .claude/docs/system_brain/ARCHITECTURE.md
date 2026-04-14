# Architecture

## Goal
A live, truthful walk-in queue that stays synced with barbers’ schedules/availability.

## What this system is (1 sentence)
A queue + scheduler sync engine that always knows who is available, who is next, and when.

## Core Data (entities)
- **shops**
- **barbers**
- **services**
- **appointments** (from internal + external calendars)
- **barber_state** (available / busy / break / off / late)
- **walkins** (queue entries)
- **assignments** (walkin -> barber)
- **events** (audit log of changes)

## External Integrations (schedule sources)
- (ex: Google Calendar / Acuity / Square / etc)
- Sync direction:
  - Pull schedule into system
  - Push updates back? (yes/no)

## System Modules
### 1) Schedule Sync
- Imports barber schedules
- Normalizes time blocks into a single format
- Detects conflicts + overlaps

### 2) Availability Engine
- Computes “available now” per barber
- Rules: break blocks, appointments, buffer times, shop hours

### 3) Queue Engine
- Stores walk-ins and their requested service
- Maintains queue ordering + priority flags

### 4) Assignment Engine
- Picks next barber for next walk-in using Queue Logic
- Writes assignment + updates barber_state

### 5) UI + Admin
- Barber view: who’s next, my status, my upcoming schedule
- Shop view: queue, barbers, assignments, timeline

## Key Flows
### Flow A: New walk-in arrives
walkin created → queue updated → (optional) auto-assign if barber available

### Flow B: Barber becomes available
schedule/appointment ends → availability updates → assignment engine runs

### Flow C: External schedule changes
sync pulls updates → availability recalculated → queue/assignments reconciled

## Rules that must never break
- Never assign a barber who is not available
- Never double-book a barber
- Always keep an audit trail (who changed what + when)
- System time is source of truth (timezone-safe)

## Tech Stack (what you’re using)
- Frontend:
- Backend:
- Database:
- Auth:
- Hosting:

## File Map (where to look in the repo)
- `supabase/migrations/` = schema
- `src/` = app code
- `docs/system_brain/` = brain
