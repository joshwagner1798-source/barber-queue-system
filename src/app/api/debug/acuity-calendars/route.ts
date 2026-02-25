import { NextRequest, NextResponse } from 'next/server'
import { AcuityProvider } from '@/lib/calendar/acuity-provider'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const reconcileSecret = process.env.RECONCILE_SECRET
  const cronSecret = process.env.CRON_SECRET
  const validTokens = [reconcileSecret, cronSecret].filter(Boolean)

  if (validTokens.length === 0 || !validTokens.some((t) => auth === `Bearer ${t}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = new AcuityProvider()
  const calendars = await provider.getCalendars()

  return NextResponse.json({ calendars })
}