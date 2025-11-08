import { withMiddlewareAuthRequired } from '@auth0/nextjs-auth0/edge'

export default withMiddlewareAuthRequired()

export const config = {
  matcher: ['/learn/:path*', '/leaderboard/:path*', '/quests/:path*', '/shop/:path*', '/lesson/:path*'],
}
