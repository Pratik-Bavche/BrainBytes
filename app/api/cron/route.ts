import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { resetDailyQuests, resetWeeklyQuests } from '@/actions/quest'

// This function will be triggered by Vercel Cron
export async function GET(request: Request) {
  const headersList = headers()
  const authHeader = headersList.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Determine if it's time to reset weekly quests (e.g., every Monday)
  const isMonday = new Date().getDay() === 1

  try {
    await resetDailyQuests()
    if (isMonday) {
      await resetWeeklyQuests()
    }

    return NextResponse.json({ success: true, reset: { daily: true, weekly: isMonday } })
  } catch (error) {
    console.error('[CRON_ERROR]', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}