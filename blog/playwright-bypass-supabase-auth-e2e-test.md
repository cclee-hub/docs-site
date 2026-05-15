---
title: 绕过 Supabase Auth 实现 Playwright E2E 测试免登录
description: 通过 localStorage 注入 mock 认证状态，让 Playwright 测试跳过 Supabase/OAuth 登录流程，提升测试稳定性和速度。
date: 2026-03-19
tags: [Playwright, React, Supabase, E2E测试, ai-agent, saas-development]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Playwright E2E 测试如何绕过 Supabase 认证？"
    a: "通过 localStorage 注入 mock 用户数据，在 useAuth hook 中检测并跳过 Supabase 初始化，实现免登录测试。"
  - q: "为什么测试时 AuthGuard 会卡在 loading 状态？"
    a: "Zustand store 的 loading 默认值为 true，但 E2E 测试中状态未及时更新，需改为 false 或在测试模式下立即设置。"
  - q: "这种方案会影响生产代码吗？"
    a: "不会。测试模式通过特定 localStorage key 触发，生产环境不存在这些 key，代码路径完全隔离。"
---

在为客户构建 AI Agent SaaS 平台时遇到此问题，记录根因与解法。

## TL;DR

E2E 测试不应该依赖真实的 OAuth 登录流程。通过在 `useAuth` hook 中检测 `localStorage` 的测试标记，直接注入 mock 认证状态，跳过 Supabase 初始化。同时将 Zustand store 的 `loading` 默认值改为 `false`，避免 AuthGuard 卡在无限 spinner。


<!-- truncate -->
## 问题现象

使用 Playwright 测试 React SPA 时，页面被 `AuthGuard` 组件保护，需要 Supabase 认证才能访问。测试启动后，页面一直显示 loading spinner，无法进入业务流程。

```typescript
// AuthGuard 组件 - 测试时卡在这里
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <Spinner />  // 永远显示 spinner
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}
```

测试代码尝试模拟登录，但 Supabase Auth SDK 内部状态无法通过简单的 API mock 控制。

## 根因

### 1. Supabase Auth 是异步初始化的

`useAuth` hook 在 `useEffect` 中调用 `supabase.auth.getSession()`，这是异步操作。测试环境下网络请求可能失败或超时，导致状态永远停留在 `loading: true`。

### 2. Zustand Store 的默认值问题

```typescript
// authStore.ts - 问题代码
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: true,  // 👈 默认值是 true
      // ...
    }),
    { name: 'auth-storage' }
  )
)
```

测试启动时，`loading: true` + 异步初始化失败 = 永远 loading。

### 3. OAuth 流程无法自动化

即使能 mock API，OAuth 的重定向流程需要真实浏览器交互，E2E 测试无法可靠模拟。

## 解决方案

### 步骤 1：在 useAuth hook 中添加测试模式检测

```typescript
// hooks/useAuth.ts
export function useAuth() {
  const { user, token, loading, setUser, setToken, setLoading } = useAuthStore()

  useEffect(() => {
    const initAuth = async () => {
      // 👇 优先检测测试模式
      const testAuthUser = localStorage.getItem('test-auth-user')
      const testAuthToken = localStorage.getItem('test-auth-token')

      if (testAuthUser && testAuthToken) {
        try {
          const userData = JSON.parse(testAuthUser) as User
          setUser(userData)
          setToken(testAuthToken)
          setLoading(false)
          console.log('[useAuth] Using test mode auth')
          return  // 👈 直接返回，跳过 Supabase 初始化
        } catch (e) {
          console.error('Failed to parse test auth user:', e)
        }
      }

      // 👇 正常模式：走 Supabase Auth
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

    // 👇 测试模式下跳过 auth state listener
    if (localStorage.getItem('test-auth-user')) {
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // ... 正常的 auth state 处理
      }
    )

    return () => subscription.unsubscribe()
  }, [])
}
```

### 步骤 2：修改 Zustand Store 默认值

```typescript
// stores/authStore.ts
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: false,  // 👈 改为 false，让 useAuth hook 控制状态
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

### 步骤 3：在 Playwright Fixture 中注入测试认证

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
    // 先访问页面以设置 localStorage 的 origin
    await page.goto('/login')

    // 👇 注入测试认证状态到 localStorage
    await page.evaluate(
      ({ user, token }) => {
        localStorage.setItem('test-auth-user', JSON.stringify(user))
        localStorage.setItem('test-auth-token', token)
      },
      { user: mockUser, token: 'mock-access-token' }
    )

    // 导航到受保护页面，useAuth 会检测到测试模式
    await page.goto('/dashboard')

    await use(page)
  },
})
```

### 步骤 4：在测试中使用

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from './fixtures'

test('dashboard shows user agents', async ({ authenticatedPage }) => {
  // authenticatedPage 已经通过认证，无需登录
  await expect(authenticatedPage.getByText('Test Agent')).toBeVisible()
})
```

## 完整代码结构

```
agent-frontend/
├── e2e/
│   ├── fixtures.ts          # Playwright fixture + mock 数据
│   ├── dashboard.spec.ts    # 测试用例
│   └── ...
├── src/
│   ├── hooks/
│   │   └── useAuth.ts       # 测试模式检测
│   └── stores/
│       └── authStore.ts     # loading: false 默认值
└── playwright.config.ts
```

## 关键要点

1. **测试模式 key 使用特殊前缀**：`test-auth-*` 不会在生产环境中出现
2. **检测优先于初始化**：先检查 localStorage，再走 Supabase Auth
3. **跳过 auth listener**：测试模式下不需要监听 auth state 变化
4. **loading 默认值改为 false**：让 hook 显式控制 loading 状态

---
**对类似需求感兴趣？[联系合作](/about)**
