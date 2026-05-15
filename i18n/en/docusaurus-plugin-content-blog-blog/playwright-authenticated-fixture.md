---
title: Skip Login in Playwright Tests with Custom Fixtures
description: Use test.extend to create authenticatedPage fixture that auto-injects auth token and mocks API, skipping repetitive login flows
date: 2026-03-19
tags: [Playwright, E2E Testing, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to skip login in Playwright tests?"
    a: "Use Custom Fixture with addInitScript to inject auth token into localStorage before page load, tests start already authenticated"
  - q: "Why use addInitScript instead of setting localStorage after page load?"
    a: "addInitScript executes before page load, avoiding race conditions where auth guard redirects before token is set"
---

Encountered this issue while building an AI Agent platform. Here's the root cause and solution.

## TL;DR

Use Playwright's `test.extend()` to create a custom fixture that injects auth token into localStorage via `page.addInitScript()` before page load. Tests use `authenticatedPage` instead of `page`, automatically getting logged-in state without repeating login in each test.


<!-- truncate -->
## Problem

E2E tests need to verify pages behind authentication:

```typescript
// ❌ Every test goes through login
test('dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'test@example.com')
  await page.fill('input[name="password"]', 'password')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
  // Finally can start testing...
  await expect(page.locator('h1')).toBeVisible()
})
```

Problems:
1. **Repeated login in every test** — Wastes time, slows CI
2. **Depends on real auth service** — Tests fail when Supabase Auth is unavailable
3. **State pollution between tests** — Login state may affect other tests

## Solution

### 1. Create Custom Fixture

```typescript
// e2e/fixtures.ts
import { test as base, expect, Page } from '@playwright/test'

// Mock user data
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
}

export const mockAccessToken = 'mock-access-token-for-testing'

// Inject auth token into localStorage
export async function setupMockAuth(page: Page) {
  await page.addInitScript(
    ({ user, accessToken }) => {
      const mockSession = {
        access_token: accessToken,
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user,
      }
      // Supabase auth token key format: sb-{project}-auth-token
      localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(mockSession))
    },
    { user: mockUser, accessToken: mockAccessToken }
  )
}

// Extend fixture
export const test = base.extend<{
  authenticatedPage: Page
}>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page)
    await use(page)
  },
})

export { expect }
```

### 2. Use authenticatedPage in Tests

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from './fixtures'

test.describe('Dashboard', () => {
  test('should display welcome message', async ({ authenticatedPage }) => {
    // Direct access to protected page, no login needed
    await authenticatedPage.goto('/dashboard')

    await expect(authenticatedPage.locator('h1')).toContainText('Welcome')
  })

  test('should show agent list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard')

    const agents = authenticatedPage.locator('[data-testid="agent-card"]')
    await expect(agents.first()).toBeVisible()
  })
})
```

### 3. Comparison: Unauthenticated vs Authenticated

```typescript
// Unauthenticated test (redirects to login)
test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForTimeout(500)

  expect(page.url()).toContain('/login')
})

// Authenticated test (direct dashboard access)
test('allows access when authenticated', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard')
  await authenticatedPage.waitForTimeout(500)

  expect(authenticatedPage.url()).not.toContain('/login')
})
```

## Core Principles

### addInitScript vs Setting After Page Load

```typescript
// ❌ Wrong: Set after page load (may have already redirected)
await page.goto('/dashboard')
await page.evaluate(() => {
  localStorage.setItem('auth-token', '...')
})
// Auth guard already detected unauthenticated and redirected

// ✅ Correct: Inject before page load
await page.addInitScript(() => {
  localStorage.setItem('auth-token', '...')
})
await page.goto('/dashboard')  // Auth guard detects token on load
```

`addInitScript` executes:
1. Before page DOM parsing
2. Before React/Vue framework initialization
3. Before auth guard checks

### Fixture Lifecycle

```
test('dashboard', async ({ authenticatedPage }) => {})
                ↓
        base.extend<{ authenticatedPage }>()
                ↓
        authenticatedPage: async ({ page }, use) => {
          await setupMockAuth(page)  // 1. Setup auth
          await use(page)            // 2. Run test
        }                            // 3. Auto cleanup
```

## Complete Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // Serial execution to avoid state pollution
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Extension: Combined with API Mock

```typescript
export const test = base.extend<{
  authenticatedPage: Page
}>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page)
    await setupMockApi(page)  // Also mock API
    await use(page)
  },
})
```

## Key Principles

1. **Fixture over beforeEach** — Automatic reuse, cleaner code
2. **addInitScript avoids race conditions** — Inject token before auth guard checks
3. **Isolate test data** — Don't mix mock users/tokens with production
4. **Serial execution prevents pollution** — `workers: 1` or `fullyParallel: false`

---
**Interested in similar solutions? [Contact us](/about)**
