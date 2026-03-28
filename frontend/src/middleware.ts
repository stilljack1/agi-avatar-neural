// ─────────────────────────────────────────────────────────
//  AGI-1 — Route Protection Middleware
//  Flow: anonymous → /welcome → /login → /plans → /neural
// ─────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = [
  '/welcome',
  '/login',
  '/register',
  '/plans',
  '/settings',
  '/terms',
  '/privacy',
  '/agreement',
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/video/',
  '/images/',
];

// Product routes that require full onboarding
const PRODUCT_PATHS = ['/neural', '/jack', '/julia', '/assistant', '/workspace', '/dashboard', '/singularity', '/overview'];

// Build the canonical origin from forwarded headers (behind nginx proxy)
function getOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'agi1.org';
  return `${proto}://${host}`;
}

function redirect(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, getOrigin(request)));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth session token (Auth.js v5 uses this cookie)
  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value;

  const isAuthenticated = !!sessionToken;

  // Root path: check welcome video seen + auth state
  if (pathname === '/') {
    const welcomeSeen = request.cookies.get('agi1_welcome_seen')?.value;

    if (!isAuthenticated) {
      // First visit: show welcome video
      if (!welcomeSeen) {
        return redirect(request, '/welcome');
      }
      // Returning visitor who's seen video: go to login
      return redirect(request, '/login');
    }

    // Authenticated: check if onboarding complete via cookie hint
    const onboarded = request.cookies.get('agi1_onboarded')?.value;
    if (!onboarded) {
      return redirect(request, '/plans');
    }

    // Fully onboarded: go to product
    return redirect(request, '/neural');
  }

  // Product routes: require authentication
  if (PRODUCT_PATHS.some(p => pathname.startsWith(p))) {
    if (!isAuthenticated) {
      return redirect(request, '/login');
    }
    // Allow through — server components will do deeper entitlement checks
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
