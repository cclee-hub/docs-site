---
title: Full API Mocking with Playwright page.route()
description: Use page.route() to intercept all API requests and return mock data, completely decoupling E2E tests from backend
date: 2026-03-19
tags: [Playwright, E2E Testing, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "How to mock API in Playwright tests?"
    a: "Use page.route('**/api/xxx', route => route.fulfill({ status: 200, body: JSON.stringify(data) })) to intercept requests"
  - q: "Why mock API instead of using real backend?"
    a: "Mocking makes tests independent of backend state, avoids side effects, runs faster, and works reliably in CI"
---

Encountered this issue while building an AI Agent platform. Here's the root cause and solution.

## TL;DR

Use `page.route()` to intercept all API requests and return predefined mock data. Tests don't depend on real backend, can run stably in any environment, and avoid side effects like creating/deleting data.


<!-- truncate -->
## Problem

E2E tests calling real API:

```typescript
// ❌ Depends on real backend
test('create agent', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  // Click create button
  await authenticatedPage.click('button:has-text("Create")')

  // Fill form
  await authenticatedPage.fill('input[name="name"]', 'Test Agent')
  await authenticatedPage.click('button[type="submit"]')

  // Wait for API response
  await authenticatedPage.waitForTimeout(2000)

  // Verify... but what if backend is down? DB connection failed?
})
```

Problems:
1. **Depends on backend state** — Tests fail when backend is down
2. **Data side effects** — Each run creates real data
3. **Not repeatable** — Data changes cause assertion failures
4. **CI environment issues** — Need full backend service running

## Solution

### 1. Define Mock Data

```typescript
// e2e/fixtures.ts
export const mockAgents = [
  {
    agent_id: 'agent-1',
    user_id: 'test-user-id',
    name: 'Test Agent 1',
    skills: [],
    mcp_tools: [],
    llm_config: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    risk_threshold: 'medium',
    auto_confirm_low: true,
    created_at: '2024-01-01T00:00:00Z',
  },
]

export const mockSkills = [
  {
    skill_id: 'skill-1',
    owner_id: 'test-user-id',
    name: 'Test Skill',
    system_prompt: 'You are helpful.',
    is_public: false,
    is_own: true,
  },
]
```

### 2. Setup API Mock

```typescript
export async function setupMockApi(page: Page) {
  // Mock GET /api/agents
  await page.route('**/api/agents', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAgents),
      })
    } else if (route.request().method() === 'POST') {
      // Simulate creation
      const body = route.request().postDataJSON()
      const newAgent = {
        agent_id: `agent-${Date.now()}`,
        user_id: 'test-user-id',
        name: body.name,
        created_at: new Date().toISOString(),
        ...body,
      }
      mockAgents.push(newAgent)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newAgent),
      })
    }
  })

  // Mock GET/PATCH/DELETE /api/agents/:id
  await page.route('**/api/agents/*', async (route) => {
    const url = route.request().url()
    const match = url.match(/\/api\/agents\/([^/]+)/)
    const agentId = match?.[1]

    if (route.request().method() === 'GET') {
      const agent = mockAgents.find((a) => a.agent_id === agentId)
      await route.fulfill({
        status: agent ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(agent || { error: 'Not found' }),
      })
    } else if (route.request().method() === 'DELETE') {
      const index = mockAgents.findIndex((a) => a.agent_id === agentId)
      if (index !== -1) mockAgents.splice(index, 1)
      await route.fulfill({ status: 204 })
    }
  })

  // Mock /api/skills
  await page.route('**/api/skills**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSkills),
    })
  })

  // Mock /api/health
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  })
}
```

### 3. Use in Fixture

```typescript
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page)
    await setupMockApi(page)  // Intercept all API
    await use(page)
  },
})
```

### 4. Use in Tests

```typescript
// e2e/dashboard.spec.ts
import { test, expect, mockAgents } from './fixtures'

test('should display agent list', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  // API automatically mocked, returns mockAgents
  const agentCards = authenticatedPage.locator('[data-testid="agent-card"]')

  // Assertion based on known mock data
  await expect(agentCards).toHaveCount(mockAgents.length)
})

test('should create new agent', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  await authenticatedPage.click('button:has-text("Create")')

  const dialog = authenticatedPage.locator('[role="dialog"]')
  await dialog.locator('input[name="name"]').fill('New Agent')
  await dialog.locator('button[type="submit"]').click()

  // POST /api/agents mocked, returns 201
  await authenticatedPage.waitForTimeout(500)

  // Verify UI update
  await expect(authenticatedPage.locator('text=New Agent')).toBeVisible()
})
```

## Core Techniques

### URL Matching Patterns

```typescript
// Exact match
await page.route('**/api/agents', handler)

// Wildcard match
await page.route('**/api/agents/**', handler)

// Regex match
await page.route(/\/api\/agents\/\d+/, handler)
```

### Reading Request Body

```typescript
await page.route('**/api/agents', async (route) => {
  const body = route.request().postDataJSON()
  console.log('Request body:', body)

  // Return different responses based on request content
  if (body.name === 'error-test') {
    await route.fulfill({ status: 400, body: JSON.stringify({ error: 'Bad request' }) })
  } else {
    await route.fulfill({ status: 201, body: JSON.stringify({ id: 'new-id', ...body }) })
  }
})
```

### Simulating Error Scenarios

```typescript
// Network error
await page.route('**/api/agents', (route) => route.abort('failed'))

// Timeout
await page.route('**/api/agents', async (route) => {
  await new Promise((r) => setTimeout(r, 30000))
  route.continue()
})

// 500 error
await page.route('**/api/agents', (route) =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal error' }) })
)
```

### Partial Pass-through

```typescript
// Only mock specific API, pass through others
await page.route('**/api/**', async (route) => {
  const url = route.request().url()

  if (url.includes('/api/agents')) {
    await route.fulfill({ status: 200, body: JSON.stringify(mockAgents) })
  } else {
    await route.continue()  // Other APIs use real requests
  }
})
```

## Mock Data Management

```typescript
// Centralize all mock data
// e2e/fixtures.ts
export const mockData = {
  agents: [...],
  skills: [...],
  apiKeys: [...],
  tasks: [...],
}

// Reset before each test
test.beforeEach(() => {
  Object.assign(mockData, JSON.parse(JSON.stringify(originalMockData)))
})
```

## Key Principles

1. **Mock all external dependencies** — API, OAuth, third-party services
2. **Match real data structures** — Mock data should match API contract
3. **Cover success and failure** — Test 200/400/500 scenarios
4. **Isolate test data** — Each test uses independent mock data copy

---
**Interested in similar solutions? [Contact us](/about)**
