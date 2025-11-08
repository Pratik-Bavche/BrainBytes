import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/db/drizzle'
import { challengeMatches, challengeSubmissions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Pusher from 'pusher'
import { runPythonSandbox } from '@/lib/sandbox' // we implement this next
import { computeScore } from '@/lib/scoring'     // also implement

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new NextResponse('Unauthorized', { status: 401 })

  const { matchId, code } = await req.json()
  if (!matchId || !code.trim()) return new NextResponse('Bad Request', { status: 400 })

  const match = await db.query.challengeMatches.findFirst({
    where: eq(challengeMatches.id, matchId)
  })

  if (!match || (match.playerOneId !== userId && match.playerTwoId !== userId)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // ✅ Run code in isolated runner
  const result = await runPythonSandbox(code)

  // 🕒 relative match time for speed score
  const submittedAt = Date.now() - match.startedAt.getTime()

  // ✅ Store submission
  await db.insert(challengeSubmissions).values({
    matchId,
    userId,
    passed: result.passed,
    total: result.total,
    runtime: result.runtime_ms,
    submittedAt,
    details: JSON.stringify(result.results)
  })

  // 🔄 Notify opponent with limited info
  await pusher.trigger(`private-match-${matchId}`, 'opponent_update', {
    userId,
    summary: {
      p: result.passed, t: result.total, r: result.runtime_ms
    }
  })

  // ✅ Check if both submitted
  const submissions = await db.query.challengeSubmissions.findMany({
    where: eq(challengeSubmissions.matchId, matchId)
  })

  if (submissions.length === 2) {
    const scores = computeScore(submissions)
    await pusher.trigger(`private-match-${matchId}`, 'final_scores', scores)
  }

  return NextResponse.json({ ok: true, result })
}
