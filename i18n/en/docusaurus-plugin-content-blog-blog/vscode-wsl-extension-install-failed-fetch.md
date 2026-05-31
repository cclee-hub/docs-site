---
title: "VSCode WSL Extension 'Failed to Fetch'? VSIX Download Saved as Gzip Instead of Zip"
description: "After a VSCode upgrade, the extension becomes unresponsive and reinstalling reports 'Failed to fetch'. Root cause: marketplace returns gzip-compressed content, curl -L doesn't auto-decompress, VSIX ends up as gzip. Fix: manual download + gunzip + code --install-extension."
date: 2026-05-31
tags: [VSCode, WSL2, curl]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "Is the VSCode extension 'Failed to fetch' error caused by a proxy?"
    a: "Not necessarily. The marketplace server itself returns gzip-compressed content via standard HTTP content negotiation, and curl -L may not auto-decompress when following redirects. Manual download and gunzip decompression before installing bypasses this."
  - q: "What to do when WSL extensions become unresponsive after a VSCode upgrade?"
    a: "Major VSCode upgrades reinitialize the WSL remote extension host, which may cause extensions to become unresponsive. Uninstall, download the VSIX manually, and install with code --install-extension to restore it."
  - q: "VSIX install reports 'not a zip file' — what now?"
    a: "The file is in gzip format instead of zip. The marketplace server returns gzip-compressed content, and curl -L may not auto-decompress. Decompress with gunzip -c file.vsix.gz > file.vsix before installing, and use the file command to verify the format."
---

After a major VSCode upgrade, the Claude Code extension becomes unresponsive for extended periods. The only option is to uninstall and reinstall — but then you hit `Failed to fetch`, VSIX format errors, and a series of other installation issues.

## TL;DR

After a VSCode upgrade, the extension may become unresponsive. Uninstalling and reinstalling reports `Failed to fetch`, and manually downloading the VSIX hits format errors. Root cause: the marketplace server returns gzip-compressed content (standard HTTP content negotiation), and `curl -L` may not auto-decompress when following redirects — the saved file ends up as gzip instead of zip. Fix: manual curl download → `gunzip` decompress → `code --install-extension`.

## Symptoms

After upgrading VSCode:

1. Claude Code conversations become unresponsive, stuck at `Manifesting...`
2. Clicking the extension icon takes forever to open a dialog
3. The only option is to uninstall and reinstall — but every install method fails

After uninstalling, all reinstall attempts fail:

```bash
# VSCode UI install → Failed to fetch
# Command line install → same error
code --install-extension anthropic.claude-code
# Error installing extension: Failed to fetch
```

## Root Cause

Three factors combine to cause this issue:

**VSCode upgrade triggers WSL extension host reinitialization.** Extensions like Claude Code must be installed on the WSL side to run (defined as remote extension host extensions). After a major upgrade, the extension may become unresponsive and require uninstalling and reinstalling.

**VSCode extension installation uses its own network stack, ignoring WSL's `http_proxy`.** Even with a proxy configured in WSL (e.g., `http://172.30.0.1:7897`), VSCode's extension download channel uses its own networking, unaffected by system proxy variables.

**Marketplace server returns gzip-compressed content, `curl -L` doesn't auto-decompress.** The marketplace API endpoint returns gzip-compressed responses via HTTP content negotiation — this is standard behavior. When `curl -L` follows redirects, it may not automatically decompress `Content-Encoding: gzip`, so the saved file ends up as gzip format instead of the expected zip format. Running `file` on the download shows `gzip compressed data` instead of `Zip archive data`.

## Solution

### 1. Download VSIX manually

Use curl in the WSL terminal:

```bash
curl -L "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/anthropic/vsextensions/claude-code/latest/vspackage" \
  -o ~/claude-code.vsix
```

### 2. Check file format

```bash
file ~/claude-code.vsix
```

If the output is `gzip compressed data`, the file is gzip format — proceed to decompress. If it says `Zip archive data`, you have the raw format and can skip the next step.

### 3. Decompress to restore zip format

```bash
gunzip -c ~/claude-code.vsix > ~/claude-code-real.vsix
```

Confirm the format is correct:

```bash
file ~/claude-code-real.vsix
# Output: Zip archive data, at least v2.0 to extract
```

### 4. Verify version (optional)

```bash
unzip -p ~/claude-code-real.vsix extension/package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'])"
```

### 5. Install

```bash
code --install-extension ~/claude-code-real.vsix
```

After installation, reload the VSCode window (`Ctrl+Shift+P` → `Reload Window`) to restore the extension.

WSL2 environment issues like this are common — if you've also encountered [Docker Desktop host network mode ports unreachable from the host](/blog/docker-desktop-wsl2-host-network-unreachable), it's similarly related to WSL2's unique architecture.

<InfoBox variant="warning" title="Important Notes">

- This fix works for any VSIX download that ends up as gzip format instead of zip, not just Claude Code
- Manually installed extensions won't auto-update — future VSCode upgrades may handle updates through the normal channel
- Try adding the `--compressed` flag to curl to let it handle gzip decompression automatically; if that doesn't work, fall back to the manual gunzip workflow

</InfoBox>

## FAQ

### Is the VSCode extension "Failed to fetch" error caused by a proxy?

Not necessarily. The marketplace server itself returns gzip-compressed content via standard HTTP content negotiation, and `curl -L` may not auto-decompress when following redirects. Manual download and `gunzip` decompression before installing bypasses this.

### What to do when WSL extensions become unresponsive after a VSCode upgrade?

Major VSCode upgrades reinitialize the WSL remote extension host, which may cause extensions to become unresponsive. Uninstall, download the VSIX manually, and install with `code --install-extension` to restore it.

### VSIX install reports "not a zip file" — what now?

The file is in gzip format instead of zip. The marketplace server returns gzip-compressed content, and `curl -L` may not auto-decompress. Decompress with `gunzip -c file.vsix.gz > file.vsix` before installing, and use the `file` command to verify the format.

<div className="my-8 p-6 rounded-xl border text-center">
  <p className="text-lg font-semibold mb-2">CCLEE</p>
  <p className="text-sm mb-4">Independent developer, 24 years in e-commerce, focused on grounding AI in real business scenarios.</p>
  <a href="mailto:hi@ccleeai.com" className="button button--primary button--lg">Work with me</a>
</div>
