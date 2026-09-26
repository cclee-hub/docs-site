---
title: "vaul Drawer Won't Close or Scroll? Overflow Blocks the Drag"
description: "overflow-y-auto on vaul's DrawerContent root hijacks gestures as scrolling — the drawer can't scroll or dismiss. Fix: scroll inside a min-h-0 inner container."
date: 2026-09-26
tags: [vaul, React, Mobile, Debugging]
authors: [cclee]
image: "/images/blog/vaul-drawer-overflow-blocks-drag-en.webp"
schema: FAQPage
faqs:
  - q: "Why doesn't my vaul drawer scroll on mobile?"
    a: "Check whether the DrawerContent root carries overflow-y-auto or a max-h cap. The root element is vaul's drag layer — a scroll container on it makes the browser judge touch movement as scrolling, so vaul's drag listeners never fire. Sink scrolling into an inner flex-1 min-h-0 overflow-y-auto container and keep the header fixed on the root."
  - q: "Why can't I close my vaul drawer by dragging down?"
    a: "Same root cause as the scrolling failure: with the scroll container on the root, the browser consumes the touch gesture as scroll and vaul's dismiss gesture never triggers. Once scrolling moves to an inner layer, both symptoms disappear together — swiping the content scrolls, dragging the handle or title closes."
  - q: "Where does the scroll container go in a vaul drawer?"
    a: "Inside. The DrawerContent root keeps zero overflow and zero max-h so the drag gesture stays live; content goes into an inner flex-1 min-h-0 overflow-y-auto wrapper. min-h-0 matters: a flex child defaults to min-height auto, and without it the content stretches the drawer instead of producing a scrollbar."
---

On a real phone, our filter drawer would open but neither scroll nor dismiss — while the exact same drawer worked flawlessly in desktop browsers.

I hit this while building [Life, an AI bookkeeping assistant](/life) — filters and category management both live in bottom drawers. And we fixed this bug twice: after the first fix, a page rewrite rebuilt the drawer JSX from memory, and the same bug was back within hours.

## TL;DR

- **Root cause**: the `DrawerContent` root element is vaul's drag layer (it owns the pull-to-dismiss gesture). With `overflow-y-auto` on the root (plus `max-h-[80vh]`-style height caps), the browser judges the touch gesture as "scroll this container" and vaul's drag listeners never receive it — the drawer neither scrolls (content clipped by max-h) nor dismisses.
- **Fix**: sink scrolling into an inner layer — the root keeps only fixed regions (the header), and content goes into a `flex-1 min-h-0 overflow-y-auto` wrapper.
- **Meta-lesson**: re-fixing a structural bug means starting from the template/rule, not from memory of the old JSX.

## The symptom: fine on desktop, frozen on real devices

The drawer is shadcn/ui's Drawer (vaul ^1.1.2 underneath). The failure pattern: on desktop, scroll and dismiss both work; on real devices the content area won't scroll and pulling down won't close — the drawer feels frozen. And "can't scroll" always came together with "can't close".

That pairing points at a gesture problem, not a styling problem: on mobile, scrolling and dragging are the same finger doing the same touch move. Whether the browser or the component gets the gesture depends on which element it lands on.

## Root cause: the scroll container and the drag layer fight over one gesture

vaul's pull-to-dismiss relies on touch gesture listeners on the root element: press anywhere, drag down, the root keeps receiving touchmove, and past a threshold the drawer closes.

When the root is also a scroll container, the mobile browser's gesture arbitration steps in first: the finger movement is interpreted as "scroll this container", the browser consumes the touch events, and vaul's listeners never see enough touchmove for a dismiss decision. That's exactly why "can't scroll" and "can't close" appear as a pair — **the scroll container wins the gesture, vaul loses it, and the content stays clipped by max-h anyway**.

The broken structure (from the real diff, after the regression):

```jsx
{/* Wrong: the root is the drag layer, yet carries scroll + height cap */}
<DrawerContent className="max-h-[80vh] overflow-y-auto px-4 pb-6 text-left">
  <DrawerHeader>
    <DrawerTitle>Filters</DrawerTitle>
  </DrawerHeader>
  <div className="flex flex-col gap-4">{/* content */}</div>
  <DrawerFooter>{/* actions */}</DrawerFooter>
</DrawerContent>
```

This renders perfectly in desktop browsers — the mouse wheel drives the scroll container directly, and vaul's handle still dismisses. Which is exactly why it slips through development and only surfaces in real-device testing.

## The fix: sink scrolling to an inner layer, keep the root fixed

The correct structure strips scrolling off the root and hands it to an inner container; the header stays on the root:

```jsx
{/* Right: no overflow on the root, scrolling sinks inward */}
<DrawerContent className="text-left">
  <DrawerHeader>
    <DrawerTitle>Filters</DrawerTitle>
  </DrawerHeader>
  <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
    {/* content + footer scroll here */}
  </div>
</DrawerContent>
```

Three details that matter:

1. **Zero overflow, zero max-h on the root** — the drag gesture stays live, so pulling down anywhere dismisses.
2. **`flex-1 min-h-0` on the inner layer** — a flex child defaults to `min-height: auto`; without pinning it to zero, the content stretches the drawer and the inner layer never produces a scrollbar. `min-h-0` is the silent precondition for scrolling to work at all.
3. **The header stays on the root** — visually the title is fixed while content scrolls; interactively, dragging the handle or title means "close" while swiping the content means "scroll". Each gesture goes to its owner.

After the fix, three Playwright assertions verified it: root `overflowY === 'visible'`, inner `scrollTop` scrolls independently, and a simulated drag-down dismisses the drawer. All three passed, with no desktop regression.

## Why it regressed: rebuilding JSX from memory

The regression itself is the more instructive part. The first fix (commit a182098, 2026-09-23 08:55) solved "can't scroll on mobile". Later, a page rewrite rebuilt the drawer JSX without consulting the fix — whoever wrote it worked from memory of the old code, and `max-h` + `overflow-y-auto` went right back on the root. The second fix (f1097b2) landed at 12:10 the same day, under 4 hours after the first.

Structural bugs — DOM hierarchy, gesture ownership, scroll container placement — are different from ordinary logic bugs: remembering the conclusion isn't enough, because **the person rewriting the code isn't necessarily the person who hit the bug, and the memory isn't necessarily theirs either**. What works: distill the correct structure into a copyable template with a one-line rule — "the DrawerContent root is vaul's drag layer; no overflow or max-h on it; sink scrolling inward" — copy the template on every rewrite, and run the gesture assertions once.

<InfoBox variant="warning" title="Watch out">

"Sink scrolling inward" isn't vaul-specific: any component whose root carries drag gestures — bottom sheets, draggable dialogs — follows the same rule: **the gesture layer and the scroll layer must be separate elements**. Also remember `min-h-0` in flex column layouts: without it the symptom is "no scrollbar appears and the drawer stretches", which is different from the root-overflow symptom. When debugging, first confirm the scroll container itself can scroll, then trace gesture ownership upward.

</InfoBox>

## FAQ

### Why doesn't my vaul drawer scroll on mobile?

Check whether the DrawerContent root carries overflow-y-auto or a max-h cap. The root element is vaul's drag layer — a scroll container on it makes the browser judge touch movement as scrolling, so vaul's drag listeners never fire. Sink scrolling into an inner flex-1 min-h-0 overflow-y-auto container and keep the header fixed on the root.

### Why can't I close my vaul drawer by dragging down?

Same root cause as the scrolling failure: with the scroll container on the root, the browser consumes the touch gesture as scroll and vaul's dismiss gesture never triggers. Once scrolling moves to an inner layer, both symptoms disappear together — swiping the content scrolls, dragging the handle or title closes.

### Where does the scroll container go in a vaul drawer?

Inside. The DrawerContent root keeps zero overflow and zero max-h so the drag gesture stays live; content goes into an inner flex-1 min-h-0 overflow-y-auto wrapper. min-h-0 matters: a flex child defaults to min-height auto, and without it the content stretches the drawer instead of producing a scrollbar.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
