// ─────────────────────────────────────────────────────────
//  AGI-1 Root — Routing logic handled by middleware.ts
//  Anonymous → /welcome → /login → /plans → /neural
//  Authenticated + onboarded → /neural
// ─────────────────────────────────────────────────────────
// The middleware handles all routing. This page exists as a fallback
// that the middleware will redirect before it renders.
import { redirect } from 'next/navigation';

export default function Home() {
  // Middleware handles the routing logic based on:
  // 1. Welcome video seen (cookie)
  // 2. Auth session (cookie)
  // 3. Onboarding complete (cookie)
  // This redirect is a safety net only.
  redirect('/welcome');
}
