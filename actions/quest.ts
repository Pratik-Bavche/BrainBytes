import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { db } from '@/db/drizzle'
import {
  quests,
  userQuestProgress,
  type Quest,
  questTypeEnum,
} from '@/db/schema/quests'
import { userProgress } from '@/db/schema/userProgress'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

/**
 * Fetches all quests and the user's progress for them.
 */
export const getQuests = async (userId?: string | null) => {
  if (userId === null) return []

  let finalUserId: string

  // 1. Determine the final, definite user ID
  if (userId) {
    // If a userId is passed, use it
    finalUserId = userId
  } else {
    // Otherwise, get it from auth
    const { userId: _uid } = await auth()
    if (!_uid) return [] // Not provided and not authenticated, so return empty
    finalUserId = _uid
  }

  // 2. Now finalUserId is guaranteed to be a string
  const data = await db.query.quests.findMany({
    with: {
      userQuestProgress: {
        where: eq(userQuestProgress.userId, finalUserId), // This is now type-safe
      },
    },
  })

  return data
}

/**
 * Updates quest progress for a user based on a specific type.
 * This function is the core of the quest system.
 */
export const updateQuestProgress = async (
  userId: string,
  questType: (typeof questTypeEnum.enumValues)[number],
  increment: number = 1,
) => {
  try {
    const questsToUpdate = await db.query.quests.findMany({
      where: eq(quests.type, questType),
    })

    if (!questsToUpdate.length) {
      return
    }

    const questsToUpdateIds = questsToUpdate.map((q) => q.id)

    const currentUserProgress = await db.query.userProgress.findFirst({
      where: eq(userProgress.userId, userId),
    })

    if (!currentUserProgress) {
      throw new Error('User progress not found')
    }

    // Get current progress for all relevant quests
    const currentQuestProgresses = await db.query.userQuestProgress.findMany({
      where: and(
        eq(userQuestProgress.userId, userId),
        inArray(userQuestProgress.questId, questsToUpdateIds),
      ),
    })

    let totalPointsReward = 0
    let totalGemsReward = 0

    // Loop through each quest that could be updated
    for (const quest of questsToUpdate) {
      let progress = currentQuestProgresses.find(
        (p) => p.questId === quest.id,
      )

      // If progress doesn't exist, create it
      if (!progress) {
        const [newProgress] = await db
          .insert(userQuestProgress)
          .values({
            userId,
            questId: quest.id,
            currentProgress: 0,
            completed: false,
          })
          .returning()
        progress = newProgress
      }

      // If quest is already completed (especially for daily/weekly), skip
      if (progress.completed) {
        continue
      }

      const newProgressValue = progress.currentProgress + increment

      // Check if target is met
      if (newProgressValue >= quest.target) {
        // Target met: Mark as complete and add rewards
        await db
          .update(userQuestProgress)
          .set({
            currentProgress: quest.target, // Cap at target
            completed: true,
            lastCompletedAt: new Date(),
          })
          .where(eq(userQuestProgress.id, progress.id))

        totalPointsReward += quest.rewardPoints
        totalGemsReward += quest.rewardGems
      } else {
        // Target not met: Just update progress
        await db
          .update(userQuestProgress)
          .set({
            currentProgress: newProgressValue,
          })
          .where(eq(userQuestProgress.id, progress.id))
      }
    }

    // Apply rewards if any quests were completed
    if (totalPointsReward > 0 || totalGemsReward > 0) {
      await db
        .update(userProgress)
        .set({
          points: sql`${userProgress.points} + ${totalPointsReward}`,
          gems: sql`${userProgress.gems} + ${totalGemsReward}`,
        })
        .where(eq(userProgress.userId, userId))
    }

    // Revalidate caches
    revalidateTag(`get_user_progress::${userId}`)
    revalidateTag('get_user_progress')
    revalidateTag(`get_quests::${userId}`)
    revalidateTag('get_quests') // Added global revalidation for cron resets
  } catch (error) {
    console.error('Failed to update quest progress:', error)
  }
}

/**
 * Checks and updates milestone quests (e.g., total points).
 * Call this after any action that changes a value milestones might track.
 */
export const checkMilestoneQuests = async (userId: string) => {
  try {
    const questsToUpdate = await db.query.quests.findMany({
      where: eq(quests.type, 'milestone'),
    })

    if (!questsToUpdate.length) return

    const currentUserProgress = await db.query.userProgress.findFirst({
      where: eq(userProgress.userId, userId),
    })

    if (!currentUserProgress) {
      throw new Error('User progress not found')
    }

    const currentQuestProgresses = await db.query.userQuestProgress.findMany({
      where: and(
        eq(userQuestProgress.userId, userId),
        inArray(
          userQuestProgress.questId,
          questsToUpdate.map((q) => q.id),
        ),
      ),
    })

    let totalPointsReward = 0
    let totalGemsReward = 0

    for (const quest of questsToUpdate) {
      let progress = currentQuestProgresses.find(
        (p) => p.questId === quest.id,
      )
      if (!progress) {
        const [newProgress] = await db
          .insert(userQuestProgress)
          .values({
            userId,
            questId: quest.id,
            currentProgress: 0,
            completed: false,
          })
          .returning()
        progress = newProgress
      }

      if (progress.completed) {
        continue
      }

      // Milestone-specific logic: check against userProgress.points
      // This assumes 'Points Collector' is the only milestone.
      // You'd need more specific logic if milestones tracked different things.
      const currentMilestoneProgress = currentUserProgress.points
      const isComplete = currentMilestoneProgress >= quest.target

      await db
        .update(userQuestProgress)
        .set({
          currentProgress: Math.min(currentMilestoneProgress, quest.target),
          completed: isComplete,
          ...(isComplete && { lastCompletedAt: new Date() }),
        })
        .where(eq(userQuestProgress.id, progress.id))

      if (isComplete && !progress.completed) { // Only add rewards on the transition to complete
        totalPointsReward += quest.rewardPoints
        totalGemsReward += quest.rewardGems
      }
    }

    // Apply rewards if any quests were completed
    if (totalPointsReward > 0 || totalGemsReward > 0) {
      await db
        .update(userProgress)
        .set({
          points: sql`${userProgress.points} + ${totalPointsReward}`,
          gems: sql`${userProgress.gems} + ${totalGemsReward}`,
        })
        .where(eq(userProgress.userId, userId))
    }

    // Revalidate caches
    revalidateTag(`get_user_progress::${userId}`)
    revalidateTag('get_user_progress')
    revalidateTag(`get_quests::${userId}`)
    revalidateTag('get_quests')
  } catch (error) {
    console.error('Failed to check milestone quests:', error)
  }
}

/**
 * Resets progress for all daily quests for all users.
 * Intended to be called by a cron job.
 */
export const resetDailyQuests = async () => {
  try {
    const dailyQuests = await db.query.quests.findMany({
      where: eq(quests.type, 'daily'),
      columns: { id: true },
    })

    if (!dailyQuests.length) {
      console.log('No daily quests to reset.')
      return
    }

    const dailyQuestIds = dailyQuests.map((q) => q.id)

    await db
      .update(userQuestProgress)
      .set({
        currentProgress: 0,
        completed: false,
        lastCompletedAt: null,
      })
      .where(inArray(userQuestProgress.questId, dailyQuestIds))

    console.log(`Reset ${dailyQuestIds.length} daily quests for all users.`)
    revalidateTag('get_quests') // Revalidate for all users
  } catch (error) {
    console.error('Failed to reset daily quests:', error)
  }
}

/**
 * Resets progress for all weekly quests for all users.
 * Intended to be called by a cron job.
 */
export const resetWeeklyQuests = async () => {
  try {
    const weeklyQuests = await db.query.quests.findMany({
      where: eq(quests.type, 'weekly'),
      columns: { id: true },
    })

    if (!weeklyQuests.length) {
      console.log('No weekly quests to reset.')
      return
    }

    const weeklyQuestIds = weeklyQuests.map((q) => q.id)

    await db
      .update(userQuestProgress)
      .set({
        currentProgress: 0,
        completed: false,
        lastCompletedAt: null,
      })
      .where(inArray(userQuestProgress.questId, weeklyQuestIds))

    console.log(`Reset ${weeklyQuestIds.length} weekly quests for all users.`)
    revalidateTag('get_quests') // Revalidate for all users
  } catch (error) {
    console.error('Failed to reset weekly quests:', error)
  }
}