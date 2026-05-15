---
title: Playwright page.route() 实现 API 全量 Mock
description: 使用 page.route() 拦截所有 API 请求并返回 mock 数据，让 E2E 测试与后端完全解耦
date: 2026-03-19
tags: [Playwright, E2E测试, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Playwright 如何 mock API 返回假数据？"
    a: "使用 page.route('**/api/xxx', route => route.fulfill({ status: 200, body: JSON.stringify(data) })) 拦截请求"
  - q: "为什么要 mock API 而不是用真实后端？"
    a: "Mock API 让测试独立于后端状态、避免副作用、运行更快、可以在 CI 中稳定运行"
---

在构建 AI Agent 平台时遇到此问题，记录根因与解法。

## TL;DR

使用 `page.route()` 拦截所有 API 请求，返回预定义的 mock 数据。测试不依赖真实后端，可以在任何环境稳定运行，且避免创建/删除数据等副作用。


<!-- truncate -->
## 问题现象

E2E 测试调用真实 API：

```typescript
// ❌ 依赖真实后端
test('create agent', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  // 点击创建按钮
  await authenticatedPage.click('button:has-text("Create")')

  // 填写表单
  await authenticatedPage.fill('input[name="name"]', 'Test Agent')
  await authenticatedPage.click('button[type="submit"]')

  // 等待 API 响应
  await authenticatedPage.waitForTimeout(2000)

  // 验证... 但如果后端挂了？如果数据库连接失败？
})
```

问题：
1. **依赖后端状态** — 后端挂了测试就失败
2. **数据副作用** — 每次运行创建真实数据
3. **不可重复** — 数据变化导致断言失败
4. **CI 环境问题** — 需要启动完整后端服务

## 解决方案

### 1. 定义 Mock 数据

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

### 2. 设置 API Mock

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
      // 模拟创建
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

### 3. 在 Fixture 中使用

```typescript
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page)
    await setupMockApi(page)  // 拦截所有 API
    await use(page)
  },
})
```

### 4. 测试中使用

```typescript
// e2e/dashboard.spec.ts
import { test, expect, mockAgents } from './fixtures'

test('should display agent list', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  // API 被自动 mock，返回 mockAgents
  const agentCards = authenticatedPage.locator('[data-testid="agent-card"]')

  // 断言基于已知的 mock 数据
  await expect(agentCards).toHaveCount(mockAgents.length)
})

test('should create new agent', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/')

  await authenticatedPage.click('button:has-text("Create")')

  const dialog = authenticatedPage.locator('[role="dialog"]')
  await dialog.locator('input[name="name"]').fill('New Agent')
  await dialog.locator('button[type="submit"]').click()

  // POST /api/agents 被 mock，返回 201
  await authenticatedPage.waitForTimeout(500)

  // 验证 UI 更新
  await expect(authenticatedPage.locator('text=New Agent')).toBeVisible()
})
```

## 核心技巧

### URL 匹配模式

```typescript
// 精确匹配
await page.route('**/api/agents', handler)

// 通配符匹配
await page.route('**/api/agents/**', handler)

// 正则匹配
await page.route(/\/api\/agents\/\d+/, handler)
```

### 读取请求体

```typescript
await page.route('**/api/agents', async (route) => {
  const body = route.request().postDataJSON()
  console.log('Request body:', body)

  // 根据请求内容返回不同响应
  if (body.name === 'error-test') {
    await route.fulfill({ status: 400, body: JSON.stringify({ error: 'Bad request' }) })
  } else {
    await route.fulfill({ status: 201, body: JSON.stringify({ id: 'new-id', ...body }) })
  }
})
```

### 模拟错误场景

```typescript
// 模拟网络错误
await page.route('**/api/agents', (route) => route.abort('failed'))

// 模拟超时
await page.route('**/api/agents', async (route) => {
  await new Promise((r) => setTimeout(r, 30000))
  route.continue()
})

// 模拟 500 错误
await page.route('**/api/agents', (route) =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal error' }) })
)
```

### 部分放行

```typescript
// 只 mock 特定 API，其他放行
await page.route('**/api/**', async (route) => {
  const url = route.request().url()

  if (url.includes('/api/agents')) {
    await route.fulfill({ status: 200, body: JSON.stringify(mockAgents) })
  } else {
    await route.continue()  // 其他 API 走真实请求
  }
})
```

## Mock 数据管理

```typescript
// 集中管理所有 mock 数据
// e2e/fixtures.ts
export const mockData = {
  agents: [...],
  skills: [...],
  apiKeys: [...],
  tasks: [...],
}

// 每个测试前重置
test.beforeEach(() => {
  Object.assign(mockData, JSON.parse(JSON.stringify(originalMockData)))
})
```

## 关键原则

1. **Mock 所有外部依赖** — API、OAuth、第三方服务
2. **模拟真实数据结构** — Mock 数据应与 API 契约一致
3. **覆盖成功和失败场景** — 200/400/500 都要测试
4. **隔离测试数据** — 每个测试用独立的 mock 数据副本

---
**对类似需求感兴趣？[联系合作](/about)**
