---
title: 实现 React 级联选择下拉框
description: 解决切换父级选项后子级下拉框显示为空或值错误的问题，使用 Radix UI Select 实现级联联动。
date: 2026-03-14
tags: [React, TypeScript, aigent, UI组件, ui-component]
authors: [cclee]
schema: Article
---

## TL;DR

级联选择的核心是：**父级变化时，必须重置子级为有效值**。使用 `Record<string, Option[]>` 类型映射数据，在 `onValueChange` 回调中同步更新子级状态。


<!-- truncate -->
## 问题现象

实现 Provider → Model 级联选择时，切换 Provider 后：

```tsx
// 切换前：provider = "openai", model = "gpt-4o"
// 切换后：provider = "anthropic", model = "gpt-4o" ❌

// Model 下拉框显示为空，因为 "gpt-4o" 不在 anthropic 的模型列表中
<Select value={model}>  // model 值不在 options 中，显示空白
```

或者提交表单时，Model 值是上一个 Provider 的模型，导致后端验证失败。

## 根因

React 受控组件的 `value` 必须存在于 `options` 中。当 Provider 变化时，Model 的 options 列表更新了，但 `model` state 仍保留旧值。如果旧值不在新的 options 中，Select 组件会显示为空。

关键问题：**只更新了 options 数据，没有同步更新 state 值**。

## 解决方案

### 1. 定义数据结构

```tsx
const AVAILABLE_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
]

// 使用 Record 类型建立映射关系
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

### 2. State 初始化

```tsx
const [provider, setProvider] = useState('deepseek')
const [model, setModel] = useState('deepseek-chat')  // 初始值必须是 provider 对应的第一个模型
```

### 3. 关键：Provider 变化时重置 Model

```tsx
const handleProviderChange = (value: string | null) => {
  if (value) {
    setProvider(value)
    // 核心：重置 model 到新 provider 的第一个选项
    const models = AVAILABLE_MODELS[value]
    if (models && models.length > 0) {
      setModel(models[0].value)
    }
  }
}
```

### 4. 完整组件示例

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
      {/* Provider 选择 */}
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

      {/* Model 选择 - 动态根据 provider 显示选项 */}
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

### 5. 表单重置

关闭 Dialog 时重置表单，避免下次打开时保留旧状态：

```tsx
const resetForm = () => {
  setProvider('deepseek')
  setModel('deepseek-chat')  // 重置为 provider 对应的默认值
}

const handleOpenChange = (newOpen: boolean) => {
  if (!newOpen) {
    resetForm()
  }
  onOpenChange(newOpen)
}
```

## FAQ

### Q: React 级联选择下拉框切换后子级显示为空怎么办？

A: 在父级 `onValueChange` 回调中，同步更新子级 state 为新选项列表的第一个值。受控组件的 `value` 必须存在于 `options` 中。

### Q: 如何用 TypeScript 定义级联选择的数据类型？

A: 使用 `Record<string, Option[]>` 类型建立父级到子级的映射，例如 `Record<string, { value: string; label: string }[]>`，类型安全且易于扩展。

### Q: Select 组件的 value 和 options 不匹配会怎样？

A: 大多数 UI 库（Radix、MUI、Ant Design）会显示空白或 placeholder，不会报错。这是受控组件的预期行为——确保 `value` 始终是有效的选项值。
