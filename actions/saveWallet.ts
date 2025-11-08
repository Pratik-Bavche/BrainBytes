'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/db/drizzle'
import { userProgress } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ethers } from 'ethers'

export const savewallet_address = async (wallet_address: string) => {
  const { userId } = await auth()

  if (!userId) {
    return { error: 'Unauthorized' }
  }

  if (!ethers.isAddress(wallet_address)) {
    return { error: 'Invalid wallet address' }
  }

  try {
    await db
      .update(userProgress)
      .set({
        wallet_address: wallet_address,
      })
      .where(eq(userProgress.userId, userId))

    revalidateTag(`get_user_progress::${userId}`)
    revalidateTag('get_user_progress')
    console.log("Wallet Updated:",userProgress)
    return { success: true, wallet_address: wallet_address }
  } catch (error) {
    console.error('Error saving wallet address:', error)
    if (error instanceof Error && error.message.includes('duplicate key')) {
        return { error: 'This wallet address is already in use.' }
    }
    return { error: 'Failed to save wallet address' }
  }
}