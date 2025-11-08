'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { ChallengeType, ChallengeMatchType } from '@/db/schema'
import { findOrJoinMatch, submitP2PChallenge, sendProgressUpdate } from '@/actions/challengeMatch'
import Editor from '@monaco-editor/react'
import Pusher from 'pusher-js'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUser } from '@auth0/nextjs-auth0/client'

const FINDING_TOAST_ID = 'competition-finding'
const WAITING_TOAST_ID = 'competition-waiting'
const SUBMISSION_TOAST_ID = 'competition-submitting'

type Props = {
  challenge: ChallengeType
}

export function CompetitionRoom({ challenge }: Props) {
  const [match, setMatch] = useState<ChallengeMatchType | null>(null)
  const [status, setStatus] = useState<'idle' | 'waiting' | 'in_progress' | 'completed'>('idle')
  const [code, setCode] = useState(challenge.stubCodeJs || '// Start coding here')
  const [opponentCodeLength, setOpponentCodeLength] = useState(0)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, startSubmission] = useTransition()

  const { user } = useUser()
  const userId = user?.sub

  const findingRef = useRef(false)

  const dismissStatusToasts = useCallback(() => {
    toast.dismiss(FINDING_TOAST_ID)
    toast.dismiss(WAITING_TOAST_ID)
  }, [])

  const startMatchSearch = useCallback(async () => {
    if (findingRef.current || !challenge.id) return

    findingRef.current = true
    setStatus('waiting')
    toast.loading('Finding an opponent...', { id: FINDING_TOAST_ID })

    try {
      const result: any = await findOrJoinMatch(challenge.id)
      setMatch(result.match)

      if (result.status === 'joined') {
        dismissStatusToasts()
        setStatus('in_progress')
        toast.success('Opponent found! The match has started.')
      } else {
        setStatus('waiting')
        toast.info('Waiting for an opponent to join...', { id: WAITING_TOAST_ID })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to find a match'
      dismissStatusToasts()
      toast.error(message)
      setError(message)
    } finally {
      findingRef.current = false
    }
  }, [challenge.id, dismissStatusToasts])

  useEffect(() => {
    if (status === 'idle' && !error) {
      startMatchSearch()
    }
  }, [status, error, startMatchSearch])

  useEffect(() => {
    return () => {
      toast.dismiss(FINDING_TOAST_ID)
      toast.dismiss(WAITING_TOAST_ID)
      toast.dismiss(SUBMISSION_TOAST_ID)
    }
  }, [])

  useEffect(() => {
    if (!match?.id || !userId) return;

    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: '/api/pusher/auth',
    });

    const channelName = `private-match-${match.id}`;
    const channel = pusherClient.subscribe(channelName);

    channel.bind('match-start', (data: { match: ChallengeMatchType }) => {
      setMatch(data.match);
      setStatus('in_progress');
      dismissStatusToasts();
      toast.success('Opponent found! The match has started.');
    });

    channel.bind('opponent-progress', (data: { senderId: string, codeLength: number }) => {
      if (data.senderId !== userId) {
        setOpponentCodeLength(data.codeLength);
      }
    });

    channel.bind('match-over', (data: { winnerId: string }) => {
      setWinnerId(data.winnerId);
      setStatus('completed');
      dismissStatusToasts();
    });

    return () => {
      pusherClient.unsubscribe(channelName);
      pusherClient.disconnect();
    };

  }, [dismissStatusToasts, match?.id, userId]);

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    setCode(value);
    if (match && status === 'in_progress') {
      sendProgressUpdate(match.id, value);
    }
  }

  const handleSubmit = () => {
    if (!match) return;
    startSubmission(() => {
      toast.loading('Submitting and testing your solution...', { id: SUBMISSION_TOAST_ID });
      submitP2PChallenge(match.id, code, 'javascript') // TODO: Remove the hardcoded language
        .then((res:any) => {
          toast.dismiss(SUBMISSION_TOAST_ID);
          if (res?.error) {
            toast.error(res.error);
          }
        })
        .catch((err:any) => {
          toast.dismiss(SUBMISSION_TOAST_ID);
          toast.error(err?.message ?? 'Submission failed')
        });
    });
  }

  if (error) {
    return (
      <div className="text-center p-10">
        <div className="text-2xl font-bold text-destructive">Error finding match</div>
        <p className="text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => {
            dismissStatusToasts()
            setError(null)
            setStatus('idle')
          }}
          className={cn(buttonVariants({ variant: 'highlight' }), 'mt-4')}
        >
          Try Again
        </button>
      </div>
    )
  }

  if (status === 'waiting' || status === 'idle') {
    return (
      <div className="text-center p-10">
        <div className="text-2xl font-bold">Waiting for opponent...</div>
        <p className="text-muted-foreground">This may take a moment.</p>
        {/* TODO: Add a loading spinner here */}
      </div>
    )
  }

  if (status === 'completed' && winnerId) {
     return (
      <div className="text-center p-10">
        <div className="text-4xl font-bold mb-4">
          {winnerId === userId ? '脂 You Won! 脂' : '丼 You Lost 丼'}
        </div>
        <p>You gained 25 XP and 1 Gem!</p>
        {/* TODO: Link back to /compete */}
      </div>
     )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-2">Problem</h2>
        {/* TODO: Use a markdown renderer for challenge.problemDescription */}
        <p className="text-muted-foreground">{challenge.problemDescription}</p>
      </div>

      <div className="space-y-4">
        <div className="bg-card border rounded-lg p-4">
            <h3 className="text-lg font-semibold">Opponent Status</h3>
            <p className="text-sm text-muted-foreground">Progress: {opponentCodeLength} characters</p>
        </div>

        <div className="h-[400px] border rounded-lg overflow-hidden">
          <Editor
            height="400px"
            language="javascript"
            theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'}
            value={code}
            onChange={handleCodeChange}
            options={{ minimap: { enabled: false } }}
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || status !== 'in_progress'}
          className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}
        >
          {isSubmitting ? 'Testing...' : 'Submit Solution'}
        </button>
      </div>
    </div>
  )
}