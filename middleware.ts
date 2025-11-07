import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/', '/buttons'])

export default clerkMiddleware(
  (auth, req) => {
    if (isPublicRoute(req)) return

    // For admin routes, just ensure user is authenticated
    // The actual admin check happens in the page component using getIsAdmin()
    auth().protect()
  },
  { debug: process.env.NODE_ENV !== 'production' }
)

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
