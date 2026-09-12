---
title: "Go Fyne Desktop Pitfalls: JSON Shadowing & SSH Fingerprints"
description: "5 pitfalls of a Go + Fyne desktop tool: JSON field shadowing, SSH fingerprint padding mismatch, fyne-cross locks, fyne.Do opt-in, WSLg black screenshots."
date: 2026-09-12
tags: [Golang, Fyne, SSH, JSON, Desktop]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Why is my Go json.Unmarshal embedded struct field always zero?"
    a: "encoding/json resolves same-name JSON keys by depth: the shallower outer field wins and the embedded struct's same-name field is never populated. Unmarshal the same data twice — once into Config, once into a pointer-only probe struct — and copy explicit values over the defaults. Add a regression test asserting explicit values survive."
  - q: "How do I update Fyne UI from a background goroutine in v2.6–2.8?"
    a: "In Fyne 2.6–2.8 the strict threading model and fyne.Do are opt-in: set fyneDo=true under [Migrations] in FyneApp.toml or build with -tags migrated_fynedo (default only from v2.9). Wrap every UI update in fyne.Do, otherwise behavior is not guaranteed."
  - q: "Why does my Go SSH fingerprint check always fail?"
    a: "Padding: ssh-keygen prints 43 unpadded base64 characters for a 32-byte ed25519 key, while Go's base64.StdEncoding appends '='. Normalize both sides — strip trailing '=', unify the 'SHA256:' prefix — before comparing, or use x/crypto's ssh.FingerprintSHA256, which is already unpadded."
---

While delivering a Go + Fyne desktop login tool for a client, we hit one pitfall in each phase: config parsing, SSH handshake, cross-platform packaging, and GUI verification. All five are solved, and every fix is reusable.

The tool was built for the [China-compliant hosting migration of a water park equipment maker](/cases/waterpark-china-hosting-migration) — after the WHM entrance was upgraded from a single password to layered gates, the team needed a way to log in without ever touching the root password. This small tool is the client side of that channel: click one button, get a one-time link into WHM. Small tool, but "small" does not mean pitfall-free.

## TL;DR

| Scenario | Root cause | Fix |
|----------|-----------|-----|
| SSH fingerprint check always fails | ssh-keygen prints unpadded base64; Go StdEncoding pads | Normalize both sides (strip `=`, unify prefix) |
| Explicit timeout parses to 0 | Embedded struct field shadowed by outer same-name field | Unmarshal the same data twice |
| fyne-cross: go.mod requires go >= 1.26.0 | Container toolchain old, GOTOOLCHAIN=local | `-env GOTOOLCHAIN=auto` |
| Goroutine UI updates not guaranteed | Strict threading model is opt-in in 2.6–2.8 | `fyneDo=true` + `-tags migrated_fynedo` |
| GL window screenshots come out black in WSLg | GL direct rendering bypasses X11 capture | Verify via server-side log counts |

## Scenario 1: SSH fingerprint check always fails? Look at the trailing equals sign

The tool's first security layer pins the host key: the client only trusts the ed25519 fingerprint hard-coded in its config, so a hijacked machine can't intercept the one-time link. The fingerprint comes from `ssh-keyscan` on the server side.

The first live test failed every connection with host key fingerprint mismatch. Only by placing expected and actual values side by side was the difference visible — **a single trailing equals sign**:

```text
ssh-keygen -lf  →  SHA256:tT5rFtRWhCcsvJg58hNOXt0rqYvSPmur6pL8xE2KxQ   (43 chars, no padding)
Go StdEncoding  →  tT5rFtRWhCcsvJg58hNOXt0rqYvSPmur6pL8xE2KxQ=          (44 chars, one =)
```

The root cause is an encoding spec detail: an ed25519 public key is 32 bytes, which base64-encodes to 44 characters, the last one being padding. `ssh-keygen -lf` **strips the padding** and prints 43 characters; Go's `base64.StdEncoding` pads by standard. Both are "correct" — stacked together, they never match.

Normalize both sides before comparing — strip trailing padding, unify the `SHA256:` prefix:

```go
// Normalize a SHA256 fingerprint: strip padding, unify prefix, validate on the way
func normalizeFingerprint(fp string) (string, error) {
	fp = strings.TrimPrefix(fp, "SHA256:")
	fp = strings.TrimRight(fp, "=")
	if _, err := base64.RawStdEncoding.DecodeString(fp); err != nil {
		return "", fmt.Errorf("invalid sha256 fingerprint: %w", err)
	}
	return "SHA256:" + fp, nil
}
```

After normalizing, a unit test covers both spellings in, one spelling out, and the four live-test paths — valid login, wrong fingerprint, unauthorized key, black-hole timeout — all behave as expected.

If you'd rather not hand-roll it: x/crypto's `ssh.FingerprintSHA256` already returns the unpadded form, matching `ssh-keygen`. The trap isn't in the library — it's in rolling your own encoding on one side only.

<InfoBox variant="warning" title="Note">x/crypto's `ssh.HandshakeError` has no `Unwrap` method — typed errors you return from the handshake callback (like a fingerprint mismatch) can't be recovered with `errors.As` once dial wraps them. Match the error text with a regex, extract both fingerprints, and rebuild the typed error so the UI can show "expected X, got Y". Found during v1.1 error-advice work.</InfoBox>

## Scenario 2: Explicit timeout parses to 0? Embedded struct fields get shadowed

The config struct looked like this: most fields live in a general `Config`, and timeouts wanted "default when absent" handling, so they were declared as outer pointer fields alongside the embedded struct:

```go
type Options struct {
	Config                    // embedded: host, port, timeouts...
	ConnectTimeout    *int    `json:"connect_timeout_seconds"`
	CommandTimeout    *int    `json:"command_timeout_seconds"`
}
```

The intent: pointer fields detect "did the user set this", and defaults fill in when nil. The live test instead reported `command timed out after 0s` — the timeout value **explicitly present in config.json** parsed to 0.

The root cause is `encoding/json`'s conflict rule: when multiple fields map to the same JSON key at **different depths**, the shallower (outer) one wins and the embedded struct's same-name field is **never populated**. So `Options.Config` kept zero-value timeouts, while the outer pointer did receive the explicit value — but the code only ever touched it in the "nil means default" branch. The explicit value landed in a field nobody read back. Silent loss.

The fix: stop trying to parse and probe defaults in one layer. Unmarshal the same data twice, each pass doing one job:

```go
type Config struct {
	Host           string `json:"host"`
	Port           int    `json:"port"`
	ConnectTimeout int    `json:"connect_timeout_seconds"`
	CommandTimeout int    `json:"command_timeout_seconds"`
}

type timeoutOverrides struct {
	Connect *int `json:"connect_timeout_seconds"`
	Command *int `json:"command_timeout_seconds"`
}

func load(raw []byte) (*Config, error) {
	cfg := &Config{ConnectTimeout: 30, CommandTimeout: 15} // defaults
	if err := json.Unmarshal(raw, cfg); err != nil {
		return nil, err
	}
	var ov timeoutOverrides
	if err := json.Unmarshal(raw, &ov); err != nil {
		return nil, err
	}
	if ov.Connect != nil {
		cfg.ConnectTimeout = *ov.Connect
	}
	if ov.Command != nil {
		cfg.CommandTimeout = *ov.Command
	}
	return cfg, nil
}
```

Pass one fills the plain fields into `Config`; pass two probes absence with pointer-only fields and overrides defaults only when a value is explicit. A regression test asserts "explicit values survive" — this class of bug is silent by nature, and without a test watching it, the next refactor will bring it back.

JSON traps aren't limited to parsing. On the serialization side we previously hit a sneakier one: `json.dumps` with `default=str` silently turns a Python set into a string, and [the `in` check then quietly returns wrong answers](/blog/python-json-dumps-set-default-str). The common thread: both happen where the type system can't see.

## Scenario 3: fyne-cross reports go.mod requires go >= 1.26.0? The container toolchain is locked

The Windows build goes through fyne-cross, and packaging failed with `go.mod requires go >= 1.26.0`. The container ships go 1.25.10 while x/crypto v0.57.0 demands go 1.26+ — and the container defaults to `GOTOOLCHAIN=local`, which disables Go 1.21's toolchain auto-switching. Whatever version ships in the image is what you're stuck with.

One-line fix — let the container fetch the toolchain it needs:

```bash
fyne-cross windows -tags migrated_fynedo -env GOTOOLCHAIN=auto
```

`GOTOOLCHAIN=auto` lets the go command download and switch to the version required by go.mod automatically. Future dependency bumps won't require touching the container. The flag is now baked into the project's build.sh.

## Scenario 4: Goroutine UI updates not guaranteed? Threading is opt-in until 2.9

Fyne 2.6 introduced a strict threading model where UI updates must go through `fyne.Do`. The easy-to-miss part: **in v2.6–2.8 neither the model nor `fyne.Do` is enabled by default**. Without explicitly opting in, mutating UI widgets from a background goroutine has no guaranteed behavior; the default flips only in v2.9.

This tool runs SSH handshakes and link fetches in background goroutines and then updates a status line — right inside that window. Enable it with a belt-and-suspenders pair:

```toml
# FyneApp.toml
[Migrations]
fyneDo = true
```

```bash
# plus the build tag
go build -tags migrated_fynedo .
```

One switch is runtime config, the other is compile-time; either alone is enough, and setting both guards against updating only one. On the code side, make it a habit:

```go
go func() {
	link, err := fetchOneTimeLink()
	fyne.Do(func() {
		if err != nil {
			status.SetText("Failed: " + err.Error())
			return
		}
		status.SetText(link)
	})
}()
```

After upgrading to v2.9, none of this needs to change, and the migration markers can stay.

## Scenario 5: WSLg screenshots of Fyne windows come out black? Verify with server-side evidence instead

The acceptance criterion was "double-click the program, press the button, the browser opens the WHM login page." For pixel-level GUI verification we found that under WSLg, screenshotting a Fyne (OpenGL) window with scrot or import yields pure black frames — GL windows render outside the X11 pixel-capture path, so conventional screenshot tools get nothing.

There is no "fix" for this one — it's a workaround, stated as such:

- Keyboard events do get through: `xdotool` sending Tab + Return successfully activated the button, so GUI automation on the input side works;
- XTest mouse clicks did not work — don't burn time on them;
- Pixel-level verification is abandoned in favor of **server-side evidence**: the button triggers a privileged `whmapi1` call on the server, so comparing the sudo log count before and after the click (21 → 22 in our run) proves "the GUI really drove the whole chain" — no screen pixels required.

For tools where the GUI is just a trigger and the real action happens server-side, a server log count is actually stronger evidence than a screenshot: it proves behavior, while a screenshot only proves appearance.

## FAQ

### Why is my Go json.Unmarshal embedded struct field always zero?

encoding/json resolves same-name JSON keys by depth: the shallower outer field wins and the embedded struct's same-name field is never populated. Unmarshal the same data twice — once into Config, once into a pointer-only probe struct — and copy explicit values over the defaults. Add a regression test asserting explicit values survive.

### How do I update Fyne UI from a background goroutine in v2.6–2.8?

In Fyne 2.6–2.8 the strict threading model and fyne.Do are opt-in: set fyneDo=true under [Migrations] in FyneApp.toml or build with -tags migrated_fynedo (default only from v2.9). Wrap every UI update in fyne.Do, otherwise behavior is not guaranteed.

### Why does my Go SSH fingerprint check always fail?

Padding: ssh-keygen prints 43 unpadded base64 characters for a 32-byte ed25519 key, while Go's base64.StdEncoding appends '='. Normalize both sides — strip trailing '=', unify the 'SHA256:' prefix — before comparing, or use x/crypto's ssh.FingerprintSHA256, which is already unpadded.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
