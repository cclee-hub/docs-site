---
title: Playwright Custom Fixtures 实现免登录测试
description: 使用 test.extend 创建 authenticatedPage fixture，自动注入 auth token 和 mock API，跳过重复登录流程
date: 2026-03-19
tags: [Playwright, E2E测试, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Playwright 测试如何跳过登录流程？"
    a: "使用 Custom Fixture 通过 addInitScript 注入 auth token 到 localStorage，测试直接以已登录状态开始"
  - q: "为什么用 addInitScript 而不是页面加载后设置 localStorage？"
    a: "addInitScript 在页面加载前执行，避免 auth guard 检测到未登录就重定向的竞态问题"
---

在构建 AI Agent 平台时遇到此问题，记录根因与解法。

## TL;DR

使用 Playwright 的 `test.extend()` 创建自定义 fixture，通过 `page.addInitScript()` 在页面加载前注入 auth token 到 localStorage。测试用 `authenticatedPage` 替代 `page`，自动获得登录状态，无需每个测试重复登录。


<!-- truncate -->
## 问题现象

E2E 测试需要验证登录后才能访问的页面：

```typescript
// ❌ 每个测试都要走登录流程
test('dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'test@example.com')
  await page.fill('input[name="password"]', 'password')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
  // 终于可以开始测试了...
  await expect(page.locator('h1')).toBeVisible()
})
```

问题：
1. **每个测试重复登录** — 浪费时间，拖慢 CI
2. **依赖真实认证服务** — Supabase Auth 不可用时测试失败
3. **测试间状态污染** — 登录状态可能互相影响

## 解决方案

### 1. 创建 Custom Fixture

```typescript
// e2e/fixtures.ts
import { test as base, expect, Page } from '@playwright/test'

// Mock 用户数据
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
}

export const mockAccessToken = 'mock-access-token-for-testing'

// 注入 auth token 到 localStorage
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
      // Supabase auth token key 格式: sb-{project}-auth-token
      localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(mockSession))
    },
    { user: mockUser, accessToken: mockAccessToken }
  )
}

// 扩展 fixture
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

### 2. 测试中使用 authenticatedPage

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from './fixtures'

test.describe('Dashboard', () => {
  test('should display welcome message', async ({ authenticatedPage }) => {
    // 直接访问受保护页面，无需登录
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

### 3. 对比：未认证 vs 已认证

```typescript
// 未认证测试（会重定向到登录页）
test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForTimeout(500)

  expect(page.url()).toContain('/login')
})

// 已认证测试（直接访问 dashboard）
test('allows access when authenticated', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard')
  await authenticatedPage.waitForTimeout(500)

  expect(authenticatedPage.url()).not.toContain('/login')
})
```

## 核心原理

### addInitScript vs 页面加载后设置

```typescript
// ❌ 错误方式：页面加载后设置（可能已重定向）
await page.goto('/dashboard')
await page.evaluate(() => {
  localStorage.setItem('auth-token', '...')
})
// 此时 auth guard 已经检测到未登录并重定向了

// ✅ 正确方式：页面加载前注入
await page.addInitScript(() => {
  localStorage.setItem('auth-token', '...')
})
await page.goto('/dashboard')  // 页面加载时 auth guard 检测到 token
```

`addInitScript` 在以下时机执行：
1. 页面 DOM 开始解析前
2. React/Vue 等框架初始化前
3. Auth guard 检查前

### Fixture 生命周期

```
test('dashboard', async ({ authenticatedPage }) => {})
                ↓
        base.extend<{ authenticatedPage }>()
                ↓
        authenticatedPage: async ({ page }, use) => {
          await setupMockAuth(page)  // 1. 设置 auth
          await use(page)            // 2. 执行测试
        }                            // 3. 自动清理
```

## 完整配置

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // 串行执行避免状态污染
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

## 扩展：结合 API Mock

```typescript
export const test = base.extend<{
  authenticatedPage: Page
}>({
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page)
    await setupMockApi(page)  // 同时 mock API
    await use(page)
  },
})
```

## 关键原则

1. **Fixture 优于 beforeEach** — 自动复用，代码更简洁
2. **addInitScript 避免竞态** — 在 auth guard 检查前注入 token
3. **隔离测试数据** — Mock 用户和 token 不要与生产混淆
4. **串行执行避免污染** — `workers: 1` 或 `fullyParallel: false`

---
**对类似需求感兴趣？[联系合作](/about)**
