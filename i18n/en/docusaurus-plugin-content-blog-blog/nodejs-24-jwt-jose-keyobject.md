---
title: Fix jose Library JWT Key Format Error in Node.js v24
description: After upgrading to Node.js v24, jose library JWT signing fails. Use crypto.createSecretKey() to convert Uint8Array to KeyObject for compatibility.
date: 2026-03-07
tags: [Node.js, JWT, jose, Bug Fix]
schema: Article
---

## TL;DR

Node.js v24 changed Web Crypto API implementation. The jose library now requires keys to be `KeyObject` or `CryptoKey` type. Wrap your key with `crypto.createSecretKey()` to fix.

<!-- truncate -->

## The Problem

After upgrading to Node.js v24, JWT signing with jose throws an error:

```
TypeError: The "key" argument must be one of type KeyObject, CryptoKey, or string
    at Sign.sign (node:internal/crypto/sign:184:10)
    at CompactSign.sign (jose)
```

**Problem code**:

```typescript
import { SignJWT, jwtVerify } from 'jose';

// ❌ No longer works in Node.js v24
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
```

## Root Cause

Node.js v24 aligns more closely with Web Crypto API standards. The jose library calls `SubtleCrypto.importKey()` internally, which now has stricter key type validation:

- `Uint8Array` is no longer directly accepted
- Must use `KeyObject` (Node.js native) or `CryptoKey` (Web Crypto API)

This is part of Node.js's ongoing effort to align with web standards, affecting all cryptographic operations using raw bytes as keys.

## Solution

Use `crypto.createSecretKey()` to wrap the key as a `KeyObject`:

```typescript
import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

// ✅ Node.js v24 compatible
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET!)
);

// Sign
export async function signToken(payload: object) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(SECRET);
}

// Verify
export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload;
}
```

**Complete example**:

```typescript
// auth/jwt.ts
import crypto from 'crypto';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';

// Lazy load to ensure env vars are available
const getSecret = () => crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET!)
);

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}
```

## FAQ

### Q: What other breaking changes are in Node.js v24?

A: Key changes include: `fs.rmdir` removed (use `fs.rm`), `url.parse` deprecated, and Web Crypto API behavior adjustments. Check the official migration guide.

### Q: jose vs jsonwebtoken - which to choose?

A: `jose` is pure JavaScript, supports more algorithms (EdDSA, ECDH), and works in Edge Runtime. `jsonwebtoken` depends on Node.js native modules and won't work in some environments like Vercel Edge.

### Q: Does RS256 asymmetric encryption need the same fix?

A: Yes. RSA keys use `crypto.createPrivateKey()` and `crypto.createPublicKey()`:

```typescript
const privateKey = crypto.createPrivateKey(process.env.PRIVATE_KEY!);
const publicKey = crypto.createPublicKey(process.env.PUBLIC_KEY!);
```
