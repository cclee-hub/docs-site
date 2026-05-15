---
title: Bypass Supabase Auth for Playwright E2E Testing Without Login
description: Inject mock auth state via localStorage to skip Supabase/OAuth login in Playwright tests, improving test stability and speed.
date: 2026-03-19
tags: [Playwright, React, Supabase, E2E Testing, ai-agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to bypass Supabase authentication in Playwright E2E tests?"
    a: "Inject mock user data via localStorage, detect it in useAuth hook to skip Supabase initialization, enabling login-free testing."
  - q: "Why does AuthGuard get stuck in loading state during tests?"
    a: "Zustand store's loading defaults to true, but E2E tests don't update state in time. Change default to false or set immediately in test mode."
  - q: "Will this approach affect production code?"
    a: "No. Test mode is triggered by specific localStorage keys that don't exist in production, keeping code paths completely isolated."
---

Encountered this issue while building an AI Agent SaaS platform for a client. Here's the root cause and solution.

## TL;DR

E2E tests shouldn't depend on real OAuth login flows. By detecting localStorage test markers in the `useAuth` hook, you can inject mock auth state directly and skip Supabase initialization. Also change the Zustand store's `loading` default to `false` to prevent AuthGuard from showing an infinite spinner.


<!-- truncate -->
## Problem

When testing a React SPA with Playwright, pages are protected by `AuthGuard` and require Supabase authentication. After the test starts, the page shows a loading spinner indefinitely and never reaches the business logic.

```typescript
// AuthGuard component - tests get stuck here
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <Spinner />  // Forever showing spinner
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}
```

Test code tries to simulate login, but Supabase Auth SDK's internal state can't be controlled by simple API mocking.

## Root Cause

### 1. Supabase Auth Initializes Asynchronously

The `useAuth` hook calls `supabase.auth.getSession()` in `useEffect`, which is async. In test environments, network requests may fail or timeout, leaving state stuck at `loading: true`.

### 2. Zustand Store Default Value Problem

```typescript
// authStore.ts - problematic code
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: true,  // 👈 Default is true
      // ...
    }),
    { name: 'auth-storage' }
  )
)
```

At test startup: `loading: true` + async init failure = forever loading.

### 3. OAuth Flow Can't Be Automated

Even if APIs can be mocked, OAuth redirect flows require real browser interaction that E2E tests can't reliably simulate.

## Solution

### Step 1: Add Test Mode Detection in useAuth Hook

```typescript
// hooks/useAuth.ts
export function useAuth() {
  const { user, token, loading, setUser, setToken, setLoading } = useAuthStore()

  useEffect(() => {
    const initAuth = async () => {
      // 👇 Check test mode first
      const testAuthUser = localStorage.getItem('test-auth-user')
      const testAuthToken = localStorage.getItem('test-auth-token')

      if (testAuthUser && testAuthToken) {
        try {
          const userData = JSON.parse(testAuthUser) as User
          setUser(userData)
          setToken(testAuthToken)
          setLoading(false)
          console.log('[useAuth] Using test mode auth')
          return  // 👈 Return early, skip Supabase init
        } catch (e) {
          console.error('Failed to parse test auth user:', e)
        }
      }

      // 👇 Normal mode: proceed with Supabase Auth
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setUser(session.user as User)
          setToken(session.access_token)
        }
      } catch (error) {
        console.error('Auth init failed:', error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    // 👇 Skip auth state listener in test mode
    if (localStorage.getItem('test-auth-user')) {
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // ... normal auth state handling
      }
    )

    return () => subscription.unsubscribe()
  }, [])
}
```

### Step 2: Modify Zustand Store Default Value

```typescript
// stores/authStore.ts
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: false,  // 👈 Change to false, let useAuth hook control state
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setLoading: (loading) => set({ loading }),
      logout: () => set({ user: null, token: null, loading: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
```

### Step 3: Inject Test Auth in Playwright Fixture

```typescript
// e2e/fixtures.ts
import { test as base } from '@playwright/test'

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
}

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Visit page first to set localStorage origin
    await page.goto('/login')

    // 👇 Inject test auth state into localStorage
    await page.evaluate(
      ({ user, token }) => {
        localStorage.setItem('test-auth-user', JSON.stringify(user))
        localStorage.setItem('test-auth-token', token)
      },
      { user: mockUser, token: 'mock-access-token' }
    )

    // Navigate to protected page, useAuth will detect test mode
    await page.goto('/dashboard')

    await use(page)
  },
})
```

### Step 4: Use in Tests

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from './fixtures'

test('dashboard shows user agents', async ({ authenticatedPage }) => {
  // authenticatedPage is already authenticated, no login needed
  await expect(authenticatedPage.getByText('Test Agent')).toBeVisible()
})
```

## Complete Code Structure

```
agent-frontend/
├── e2e/
│   ├── fixtures.ts          # Playwright fixture + mock data
│   ├── dashboard.spec.ts    # Test cases
│   └── ...
├── src/
│   ├── hooks/
│   │   └── useAuth.ts       # Test mode detection
│   └── stores/
│       └── authStore.ts     # loading: false default
└── playwright.config.ts
```

## Key Takeaways

1. **Use special prefix for test mode keys**: `test-auth-*` won't appear in production
2. **Check before initialize**: Check localStorage first, then proceed with Supabase Auth
3. **Skip auth listener**: No need to listen for auth state changes in test mode
4. **Change loading default to false**: Let the hook explicitly control loading state

---
**Interested in similar solutions? [Contact us](/about)**
