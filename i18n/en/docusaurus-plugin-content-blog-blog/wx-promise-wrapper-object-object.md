---
title: "WeChat Promise Wrapper Resolves [object Object]? Take .data"
description: "wx promise wrapper passes the result object down; String() turns it into \"[object Object]\" shipped as junk base64. Fix: read res.data, throw on non-string."
date: 2026-09-26
tags: [WeChat Mini Program, Promise, Debugging]
authors: [cclee]
image: "/images/blog/wx-promise-wrapper-object-object-en.webp"
schema: FAQPage
faqs:
  - q: "Why does my WeChat mini program image recognition always fail?"
    a: "A 100% failure rate that ignores image content points at the send side, not the recognition model. Instrument the sender with shape diagnostics — payload length, decoded byte count, magic bytes — never the content itself. That's how we found our 'base64' was a 14-character junk string."
  - q: "Why does my promise wrapper return [object Object]?"
    a: "Because success: resolve passes the entire callback result object ({ data, errMsg }) as the resolved value, and String() on an object yields \"[object Object]\" silently — no error, no warning. Dot into the result (res.data) and throw when the value is not a non-empty string."
  - q: "How do I wrap wx callback APIs as promises safely?"
    a: "Resolve the whole result, then pick the documented property per API — .data for readFile, .tempFilePath for compressImage; there is no universal shape. Add a guard that throws on missing or non-string values so bad data dies at the source instead of surfacing as a generic gateway 400."
---

Tapping the photo-recognition button in our mini program failed every single time — same on devtools and real devices, regardless of which image was sent. The server only ever said "image recognition failed, please try again later."

I hit this while building [Life, an AI bookkeeping assistant](/life) — photo recognition is one of its quick capture entry points. The fix turned out to be one line; the hard part was the hunt, because every error message along the chain was lying.

## TL;DR

- **Root cause**: our own promise wrapper for wx APIs used `success: resolve`, which resolves the entire callback result — and `wx.readFile`'s success result is `{ data, errMsg }` as one object, not the data itself. Downstream, `String(b64)` turned the whole object into `"[object Object]"`; after stripping whitespace, 14 junk characters of fake base64 decoded into 9 bytes of fixed garbage and got shipped to the server.
- **Fix**: dot into the resolved object (`res.data`) and throw on non-string values.
- **Hunting tip**: when the error body is generic ("invalid params") and leaks no details, add shape diagnostics on the send side (length / charset / magic bytes, zero content) instead of running more format-guessing experiments.

## The symptom: 100% failure, independent of image content

A failure that is 100% reproducible and ignores image content points at the data on the send side — not at the recognition model.

The pipeline is: pick image → compress → read as base64 → POST to our server → forwarded to a vision model. The failure pattern was perfectly uniform: devtools matched real devices, every attempt failed. The server log showed only a 400 from the vision gateway:

```text
POST /vision  400  {"error": "invalid params"}
```

`invalid params` is a generic body — it doesn't say which parameter or how it was wrong. Our routing layer wraps any gateway failure into a 503 "image recognition failed, please try again later", so users and logs were equally uninformed.

## Two dead ends, both caused by the generic error

Generic error bodies steer debugging toward format guessing — both of our dead ends started exactly there.

**Guess one: non-standard mime type.** We first suspected the compressed image used `image/jpg` (the standard spelling is `image/jpeg`). Hitting the gateway directly with all three mime variants returned 200 every time — disproven. The image and its metadata were fine; the problem was further downstream.

**Guess two: base64 line breaks.** Next we suspected `wx.readFile` produced base64 with newlines that the gateway rejected. Injecting `\n` into a test request reproduced the same error body — note the **false positive**: a generic error means every illegal payload looks identical, so reproducing it proves nothing about what's actually on the wire. We shipped whitespace stripping on both ends anyway (`.replace(/\s+/g, '')`), retested — still 100% failure. Guess two disproven; the stripping stayed as harmless defense.

Both guesses failed for the same reason: they assumed the payload was a malformed image, when in reality **what we were sending was not an image at all**.

## Root cause: the wrapper resolved the whole callback result object

`wx.readFile`'s success result is one object, `{ data, errMsg }`, and the wrapper resolved it whole — what reached the downstream code was never base64.

With guesses exhausted, we switched tactics: add shape diagnostics on the server's failure path — metadata only (length, mime, whitespace, charset, decoded byte count, magic hex), never content, zero privacy risk. The next reproduction spat out the truth:

```text
b64Len: 14   charsetOk: false   decodedBytes: 9   magicHex: a1b8de72
```

A real image's base64 is tens of thousands of characters; this was **14**. It decoded to **9** bytes of fixed garbage, and the magic bytes were identical on every request. One more clue locked it in: **payloads from two different images were byte-for-byte identical** — a fixed string, not an image. And a 14-character fixed string is exactly `"[objectObject]"`: `"[object Object]"` with the space stripped.

Back in the code, every link in the chain looked reasonable:

```js
// Generic wrapper: callback-style API → Promise
const p = (fn) => (opts) =>
  new Promise((resolve, reject) => fn({ ...opts, success: resolve, fail: reject }))

// Read file as base64 (before the fix)
const readFileBase64 = (filePath) =>
  p(wx.getFileSystemManager().readFile.bind(wx.getFileSystemManager()))({
    filePath,
    encoding: 'base64',
  }).then((b64) => String(b64))
```

`wx.readFile`'s success callback result is **one object**: `{ data, errMsg }`. The wrapper's `success: resolve` resolved that whole object; `.then((b64) => String(b64))` received the object and `String()` coerced it into `"[object Object]"` — **zero errors anywhere**. Strip, encode, ship — everything flowed until the gateway bounced it with a generic 400.

Node's base64 decoding even ignores illegal characters (`[` and `]`), so the 12 legal base64 characters decoded into exactly 9 bytes of garbage — matching the diagnostic log digit for digit.

## The fix: dot into the value, throw on non-strings

The fix is two things: **dot into** the resolved object (`res.data`), and **throw** when the value isn't a non-empty string.

```js
const readFileBase64 = (filePath) =>
  p(wx.getFileSystemManager().readFile.bind(wx.getFileSystemManager()))({
    filePath,
    encoding: 'base64',
  }).then((res) => {
    const data = res && res.data
    if (typeof data !== 'string' || !data) throw new Error('failed to read image')
    return data
  })
```

The guard pays off the moment bad data appears: the client gets a clear message instead of a generic 400 from far away. The whole fix was +8/-1 lines in the commit, comment included.

After the fix, recognition worked on devtools and real devices alike, and the 100% failure rate disappeared.

<InfoBox variant="warning" title="Watch out">

When writing promise wrappers for wx APIs, **always dot into what you resolve** — callback result shapes differ per API: `.data` for `readFile`, `.tempFiles` for `chooseMedia`, `.tempFilePath` for `compressImage`. Confirm each one; never write a "universal then" that assumes a shape. And `String(someObject)` always silently yields `"[object Object]"` — no throw, no warning. Against generic "invalid params" errors, one shape-diagnostic log line (length / charset / magic bytes only) beats any number of guess-and-retest rounds.

</InfoBox>

## FAQ

### Why does my WeChat mini program image recognition always fail?

A 100% failure rate that ignores image content points at the send side, not the recognition model. Instrument the sender with shape diagnostics — payload length, decoded byte count, magic bytes — never the content itself. That's how we found our 'base64' was a 14-character junk string.

### Why does my promise wrapper return [object Object]?

Because success: resolve passes the entire callback result object (`{ data, errMsg }`) as the resolved value, and String() on an object yields "[object Object]" silently — no error, no warning. Dot into the result (res.data) and throw when the value is not a non-empty string.

### How do I wrap wx callback APIs as promises safely?

Resolve the whole result, then pick the documented property per API — .data for readFile, .tempFilePath for compressImage; there is no universal shape. Add a guard that throws on missing or non-string values so bad data dies at the source instead of surfacing as a generic gateway 400.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
