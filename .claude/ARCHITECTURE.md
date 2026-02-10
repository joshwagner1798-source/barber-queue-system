# Walk-In Queue Architecture

Goal:
Build a real-time walk-in queue that syncs barber availability from schedules.

Core Flow:

1. Barber schedules exist as source data.
2. Availability is calculated from schedule + active appointments.
3. Walk-in queue inserts customers into next available slot.
4. Queue updates automatically when:

   - barber becomes free
   - appointment added/removed
   - barber status changes

Architecture Principles:

- Schedule = source of truth
- Queue = calculated layer
- Real-time updates required
- No manual refresh

Data Model Concepts:

Barber:
- id
- status (active, busy, offline)

Schedule:
- barber_id
- start_time
- end_time

QueueEntry:
- customer_id
- join_time
- estimated_wait
- assigned_barber(optional)

Realtime Logic:

- Supabase realtime listens for schedule changes
- Queue recalculates automatically
