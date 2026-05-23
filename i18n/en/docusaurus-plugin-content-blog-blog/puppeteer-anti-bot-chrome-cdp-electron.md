---
title: "Puppeteer Blocked by Anti-Bot? From Chrome CDP to Electron Alternative"
description: "Puppeteer stealth plugin still detected? A full troubleshooting journey from Chrome DevTools Protocol remote debugging to Electron BrowserWindow cookie extraction"
date: 2026-05-23
tags: [puppeteer, chrome-devtools-protocol, electron, wsl2, node.js]
authors: [cclee]
schema: FAQPage
faqs:
  - q: "What to do when Puppeteer stealth plugin is still detected by anti-bot?"
    a: "Stealth plugin only bypasses basic fingerprint detection. Advanced anti-bot systems detect automation through browser behavior and low-level API characteristics. Use Electron BrowserWindow to load the target site and extract cookies via session.cookies.get() after manual login."
  - q: "Why is Chrome --remote-debugging-port not working?"
    a: "Chrome's single-instance design silently ignores --remote-debugging-port when a Chrome process is already running. You need to taskkill all Chrome processes first, then relaunch with the flag, or use --user-data-dir to specify a separate profile directory."
  - q: "How to connect to Chrome debugging port from WSL2?"
    a: "Chrome --remote-debugging-port binds to Windows 127.0.0.1 by default, but WSL2 has its own network stack where localhost points to the Linux loopback address. Solution: add --remote-debugging-address=0.0.0.0 or configure port forwarding with netsh interface portproxy."
---

Encountered this issue while building a data collection tool for a client. Here's the full troubleshooting journey from Puppeteer to Electron.

## TL;DR

Puppeteer stealth plugin cannot bypass advanced CAPTCHA-based anti-bot systems. Switching to Chrome CDP remote debugging led to WSL2 network isolation and Chrome single-instance issues. The final solution: use Electron BrowserWindow to load the target site, let the user log in manually, and automatically extract cookies via `session.cookies.get()` — eliminating anti-bot detection and cross-platform problems entirely.

## Scenario 1: Puppeteer Blocked by Anti-Bot

### Problem

Using `puppeteer-extra` + `puppeteer-extra-plugin-stealth` for automated login, the browser triggers CAPTCHA interception immediately after launch. Even after passing the CAPTCHA, subsequent pages detect the automation environment and force an exit.

```javascript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-infobars',
  ],
});

const page = await browser.newPage();
await page.goto('https://target-site.com/login');
// Anti-bot CAPTCHA system detects automation, page is blocked
```

### Root Cause

Advanced anti-bot CAPTCHA systems don't just check basic fingerprints like `navigator.webdriver`. They detect automation through multiple dimensions: Chromium build signatures, Canvas/WebGL rendering differences, mouse trajectory patterns, and even DevTools Protocol call stacks. The stealth plugin fixes known fingerprint leaks but cannot eliminate the fundamental differences between Puppeteer's Chromium and a real Chrome browser.

After 8 rounds of debugging (removing timeouts, listening for disconnect events, investigating environment differences, fully configuring stealth plugin, etc.), we confirmed that no configuration could bypass the detection.

### Solution

Abandoned Puppeteer automated login entirely. Switched to Chrome DevTools Protocol (CDP) to connect to the user's real browser and extract cookies.

## Scenario 2: WSL2 Cannot Connect to Windows Chrome CDP

### Problem

Running a Node.js script in WSL2, connecting to Windows Chrome's debugging port via `chrome-remote-interface` results in a connection timeout:

```javascript
import CDP from 'chrome-remote-interface';

const client = await CDP({
  host: 'localhost',
  port: 9222,
});
// Error: connect ECONNREFUSED 127.0.0.1:9222
```

Chrome launched on Windows with:

```bash
chrome.exe --remote-debugging-port=9222
```

Running `curl localhost:9222/json` in Windows PowerShell works fine, but WSL2 cannot connect.

### Root Cause

Chrome's `--remote-debugging-port=9222` binds to `127.0.0.1` by default — the Windows loopback address. WSL2 and Windows have separate network stacks. `localhost` inside WSL2 points to the Linux loopback address, not Windows. So accessing `localhost:9222` from WSL2 actually hits Linux's port 9222, not Windows Chrome.

### Solution

Add `--remote-debugging-address=0.0.0.0` when launching Chrome to make CDP listen on all network interfaces:

```bash
chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
```

Or configure port forwarding using Windows `netsh`:

```powershell
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
```

<InfoBox variant="warning" title="Important">

`--remote-debugging-address=0.0.0.0` exposes the CDP port to the local network, which is a security risk. Only use this in internal development environments. For production, always combine with firewall rules to restrict access.

</InfoBox>

## Scenario 3: Chrome Ignores --remote-debugging-port

### Problem

Chrome is already running. Launching Chrome again with `--remote-debugging-port=9222` silently ignores the flag. Chrome simply opens a new tab in the existing window, and the CDP port is not opened:

```bash
# Chrome already running
chrome.exe --remote-debugging-port=9222
# No error, but port 9222 is not listening
```

### Root Cause

Chrome is designed as a single-instance application. When it detects an existing Chrome process, the newly launched Chrome forwards the URL (and other command-line arguments) to the existing process and exits. Flags like `--remote-debugging-port` only take effect when the process is first created — the existing process never dynamically loads these parameters.

### Solution

Close all Chrome processes first, then relaunch with the flag:

```bash
# Windows
taskkill /F /IM chrome.exe
chrome.exe --remote-debugging-port=9222

# macOS
pkill -f "Google Chrome"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

You can also use `--user-data-dir` to specify a separate profile directory, avoiding conflicts with your daily Chrome:

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

## Final Solution: Electron BrowserWindow Cookie Extraction

The three scenarios above show that relying on an external Chrome process for cookie extraction is too fragile under WSL2 + anti-bot detection + process management constraints. The final solution: **replace external Chrome with Electron's BrowserWindow**.

### Why Electron Works

1. **No anti-bot detection**: Electron's built-in Chromium shares the same rendering engine as Chrome. Anti-bot systems do not flag it as an automated environment.
2. **No external Chrome dependency**: No need to manage Chrome processes, CDP ports, or profile directories.
3. **No WSL2 networking issues**: Electron runs natively on the target OS — no cross-OS network isolation problems.
4. **No single-instance conflicts**: Electron creates its own BrowserWindow — no conflict with the user's daily Chrome.

### Complete Implementation

**Open login window and poll for cookies:**

```javascript
import { BrowserWindow } from 'electron';

let cookieWindow = null;

function openLoginWindow() {
  cookieWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Login to Target Platform',
    webPreferences: {
      // Key: use isolated session, separate from main window
      partition: 'cookie-login',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  cookieWindow.loadURL('https://target-site.com/login');

  // Poll for target cookie
  const interval = setInterval(async () => {
    const cookies = await cookieWindow.webContents.session.cookies.get({
      domain: '.target-site.com',
    });

    const sessionCookie = cookies.find((c) => c.name === 'session_token');
    if (sessionCookie) {
      clearInterval(interval);

      // Build full cookie string
      const cookieStr = cookies
        .map((c) => c.name + '=' + c.value)
        .join('; ');

      // Write to environment variable
      process.env.SESSION_COOKIE = cookieStr;
      updateEnvFile('SESSION_COOKIE', cookieStr);

      cookieWindow.close();
    }
  }, 2000);

  cookieWindow.on('closed', () => {
    clearInterval(interval);
    cookieWindow = null;
  });
}
```

**Preload script exposing IPC interface:**

```javascript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  extractCookie: () => ipcRenderer.invoke('extract-cookie'),
  onCookieExtracted: (callback) =>
    ipcRenderer.on('cookie-extracted', (_, data) => callback(data)),
});
```

**Renderer process usage:**

```javascript
// Detect Electron environment
if (window.electronAPI) {
  document.getElementById('extractBtn').addEventListener('click', () => {
    window.electronAPI.extractCookie();
  });

  window.electronAPI.onCookieExtracted((data) => {
    console.log('Cookie extracted:', data);
  });
}
```

<InfoBox variant="warning" title="Important">

- `partition: 'cookie-login'` creates an isolated session. The login window's cookies won't pollute the main window. If you need to share login state, remove the partition option or use the same partition name.
- A 2-second polling interval balances UX and performance. Don't replace `setInterval` with a `while` + `await` loop — that would block the renderer process.
- `session.cookies.get()` only returns cookies from the current session. You cannot read cookies across partitions.

</InfoBox>

## FAQ

### What to do when Puppeteer stealth plugin is still detected by anti-bot?

The stealth plugin only bypasses basic fingerprint checks (like `navigator.webdriver`). Advanced anti-bot systems detect automation through browser behavior and low-level API characteristics, including Chromium build signatures, Canvas rendering differences, and mouse trajectory patterns. The stealth plugin cannot fully cover all detection vectors. Use Electron BrowserWindow to load the target site and extract cookies via `session.cookies.get()` after the user logs in manually.

### Why is Chrome --remote-debugging-port not working?

Chrome uses a single-process architecture. When a Chrome process is already running, the `--remote-debugging-port` flag is silently ignored. The newly launched Chrome simply opens a new tab in the existing instance without enabling the debugging port. You need to close all Chrome processes first using `taskkill /F /IM chrome.exe` (Windows) or `pkill -f "Google Chrome"` (macOS), then relaunch with the flag. Alternatively, use `--user-data-dir` to specify a separate profile directory to avoid conflicts.

### How to connect to Chrome debugging port from WSL2?

Chrome's `--remote-debugging-port` binds to Windows `127.0.0.1` by default, but WSL2 has its own network stack where `localhost` points to the Linux loopback address. Two solutions: first, add `--remote-debugging-address=0.0.0.0` when launching Chrome to make CDP listen on all interfaces; second, configure port forwarding on Windows using `netsh interface portproxy` to forward WSL2 requests to the Windows CDP port.

---

Need help with data collection or automation tools?

<a className="button button--primary button--lg" href="/contact">Contact Us</a>
