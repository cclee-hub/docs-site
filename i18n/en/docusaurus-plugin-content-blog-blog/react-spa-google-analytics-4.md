---
title: Complete Guide to Google Analytics 4 in React SPA
description: "Properly integrate GA4 in React SPA: disable auto page_view, manually track route changes with useLocation, and set User-ID for cross-device tracking."
date: 2026-03-16
tags: [React, GA4, TypeScript, aigent]
---

## TL;DR

Key points for GA4 in React SPA: 1) Set `send_page_view: false` to prevent duplicate counts; 2) Use `useLocation` to track route changes and send pageviews manually; 3) Set `user_id` after login for cross-device tracking.


<!-- truncate -->
## Problem

Using GA4 default configuration in React SPA causes:
1. Duplicate page_view counts on initial load
2. No page_view triggered on route changes
3. Unable to track logged-in users across devices

## Root Cause

GA4 automatically sends a page_view event when the script loads. But SPA route changes don't refresh the page, so GA4 can't detect URL changes. Also, User-ID must be set manually after login - default config can't identify users.

## Solution

### 1. Disable Auto Page View

When loading GA4 in `index.html`, set `send_page_view: false`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', { send_page_view: false });
</script>
```

### 2. Create Analytics Component for Route Tracking

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
      // Add user_id for logged-in users
      if (user?.id) {
        params.user_id = user.id
      }
      window.gtag('config', 'G-XXXXXXXXXX', params)
    }
  }, [location, user?.id])

  return null
}
```

### 3. Wrap Router Root

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
      // your route config...
    ],
  },
])
```

### 4. Set User-ID on Login (Optional Enhancement)

```tsx
// src/hooks/useAuth.ts
import { supabase } from '@/services/supabase'

export function useAuth() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // Set GA4 User-ID
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

### Q: Why doesn't GA4 track route changes in React SPA?

A: GA4 only sends page_view on page load by default. SPA route changes don't refresh the page, so you need to manually call `gtag('config', ...)` to send pageviews.

### Q: What is GA4 User-ID used for?

A: User-ID links user behavior across different devices, enabling cross-device analytics, user retention analysis, and other advanced features. You need to enable User-ID in GA4 admin settings.

### Q: How to verify GA4 configuration is correct?

A: Use Chrome extension "Google Tag Assistant" or GA4 DebugView (requires debug_mode). Check if page_view events fire on each route change and if user_id is set correctly.
