---
title: Implementing Cascade Select Dropdowns in React
description: Fix the issue where child select shows blank or incorrect value when parent selection changes, using Radix UI Select for cascading dropdowns.
date: 2026-03-14
tags: [React, TypeScript, aigent, UI Component]
schema: Article
---

## TL;DR

The key to cascade selection: **when parent changes, reset child to a valid value**. Use `Record<string, Option[]>` for type-safe data mapping, and update child state inside `onValueChange` callback.


<!-- truncate -->
## Problem

When implementing Provider → Model cascade selection, after switching Provider:

```tsx
// Before: provider = "openai", model = "gpt-4o"
// After: provider = "anthropic", model = "gpt-4o" ❌

// Model dropdown shows blank because "gpt-4o" is not in anthropic's model list
<Select value={model}>  // value not in options, displays blank
```

Or when submitting the form, Model value is from the previous Provider, causing backend validation to fail.

## Root Cause

In React controlled components, the `value` must exist in `options`. When Provider changes, Model's options list updates, but `model` state retains the old value. If the old value isn't in the new options, the Select component displays blank.

The key issue: **only updated the options data, didn't sync the state value**.

## Solution

### 1. Define Data Structure

```tsx
const AVAILABLE_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
]

// Use Record type for mapping
const AVAILABLE_MODELS: Record<string, { value: string; label: string }[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  ],
}
```

### 2. Initialize State

```tsx
const [provider, setProvider] = useState('deepseek')
const [model, setModel] = useState('deepseek-chat')  // Must be valid for initial provider
```

### 3. Key: Reset Model When Provider Changes

```tsx
const handleProviderChange = (value: string | null) => {
  if (value) {
    setProvider(value)
    // Core: reset model to first option of new provider
    const models = AVAILABLE_MODELS[value]
    if (models && models.length > 0) {
      setModel(models[0].value)
    }
  }
}
```

### 4. Complete Component Example

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function CascadeSelect() {
  const [provider, setProvider] = useState('deepseek')
  const [model, setModel] = useState('deepseek-chat')

  const handleProviderChange = (value: string | null) => {
    if (value) {
      setProvider(value)
      const models = AVAILABLE_MODELS[value]
      if (models && models.length > 0) {
        setModel(models[0].value)
      }
    }
  }

  return (
    <>
      {/* Provider Select */}
      <Select value={provider} onValueChange={handleProviderChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_PROVIDERS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Model Select - dynamic options based on provider */}
      <Select value={model} onValueChange={(v) => v && setModel(v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {(AVAILABLE_MODELS[provider] || []).map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
```

### 5. Form Reset

Reset form when closing Dialog to avoid stale state:

```tsx
const resetForm = () => {
  setProvider('deepseek')
  setModel('deepseek-chat')  // Reset to default for provider
}

const handleOpenChange = (newOpen: boolean) => {
  if (!newOpen) {
    resetForm()
  }
  onOpenChange(newOpen)
}
```

## FAQ

### Q: Why does my cascade select child dropdown show blank after parent changes?

A: In the parent's `onValueChange` callback, sync the child state to the first value of the new options list. In controlled components, `value` must exist in `options`.

### Q: How to type cascade select data in TypeScript?

A: Use `Record<string, Option[]>` to map parent to children, e.g., `Record<string, { value: string; label: string }[]>`. This is type-safe and easy to extend.

### Q: What happens when Select value doesn't match any option?

A: Most UI libraries (Radix, MUI, Ant Design) display blank or placeholder without errors. This is expected behavior for controlled components—ensure `value` is always a valid option.
