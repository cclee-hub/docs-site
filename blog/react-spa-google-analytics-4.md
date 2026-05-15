---
title: React SPA 集成 Google Analytics 4 完整指南
description: 在 React 单页应用中正确集成 GA4，包括禁用自动 page_view、手动追踪路由变化、设置 User-ID 实现跨设备用户追踪。
date: 2026-03-16
tags: [React, GA4, TypeScript, aigent, analytics]
authors: [cclee]
---

## TL;DR

React SPA 集成 GA4 的关键点：1) 禁用 `send_page_view: false` 避免重复追踪；2) 用 `useLocation` 监听路由变化手动发送 pageview；3) 登录后设置 `user_id` 实现跨设备追踪。


<!-- truncate -->
## 问题现象

在 React SPA 中直接使用 GA4 默认配置会导致：
1. 首次加载时 page_view 重复计数
2. 路由切换时不触发 page_view
3. 无法追踪登录用户的跨设备行为

## 根因

GA4 默认在脚本加载时自动发送一次 page_view 事件。但 SPA 的路由切换不刷新页面，GA4 无法感知 URL 变化。同时，User-ID 需要在用户登录后手动设置，默认配置无法关联用户身份。

## 解决方案

### 1. 禁用自动 page_view

在 `index.html` 中加载 GA4 时，设置 `send_page_view: false`：

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', { send_page_view: false });
</script>
```

### 2. 创建 Analytics 组件追踪路由

```tsx
// src/components/Analytics.tsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetIdOrDate: string | Date,
      params?: Record<string, unknown>
    ) => void
  }
}

export function Analytics() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      const params: Record<string, unknown> = {
        page_path: location.pathname + location.search,
      }
      // 已登录用户添加 user_id
      if (user?.id) {
        params.user_id = user.id
      }
      window.gtag('config', 'G-XXXXXXXXXX', params)
    }
  }, [location, user?.id])

  return null
}
```

### 3. 包裹路由根节点

```tsx
// src/app/routes.tsx
import { Outlet } from 'react-router-dom'
import { Analytics } from '@/components/Analytics'

function RootLayout() {
  return (
    <>
      <Analytics />
      <Outlet />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // 你的路由配置...
    ],
  },
])
```

### 4. 登录时设置 User-ID（可选增强）

```tsx
// src/hooks/useAuth.ts
import { supabase } from '@/services/supabase'

export function useAuth() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // 设置 GA4 User-ID
          if (typeof window.gtag === 'function') {
            window.gtag('config', 'G-XXXXXXXXXX', {
              user_id: session.user.id
            })
          }
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])
}
```

## FAQ

### Q: React SPA 中 GA4 为什么不追踪路由变化？

A: GA4 默认只在页面加载时发送 page_view。SPA 路由切换不刷新页面，需要手动调用 `gtag('config', ...)` 发送 pageview。

### Q: GA4 User-ID 有什么用？

A: User-ID 可以关联同一用户在不同设备上的行为，用于跨设备分析、用户留存分析等高级功能。需要在 GA4 后台开启 User-ID 功能视图。

### Q: 如何验证 GA4 配置是否正确？

A: 使用 Chrome 扩展 "Google Tag Assistant" 或 GA4 DebugView（需开启 debug_mode）。检查每次路由切换是否触发 page_view 事件，以及 user_id 是否正确设置。
