---
title: 修复 Node.js v24 中 jose 库 JWT 密钥格式错误
description: 升级到 Node.js v24 后 jose 库签名验证失败，使用 crypto.createSecretKey() 将 Uint8Array 转为 KeyObject 解决兼容性问题
date: 2026-03-07
tags: [Node.js, JWT, jose, Bug修复]
schema: Article
---

## TL;DR

Node.js v24 对 Web Crypto API 的实现有变化，jose 库要求密钥必须是 `KeyObject` 或 `CryptoKey` 类型。用 `crypto.createSecretKey()` 包装密钥即可解决。

<!-- truncate -->

## 问题现象

升级到 Node.js v24 后，使用 jose 库签名 JWT 时报错：

```
TypeError: The "key" argument must be one of type KeyObject, CryptoKey, or string
    at Sign.sign (node:internal/crypto/sign:184:10)
    at CompactSign.sign (jose/dist/node/cjs/jws/compact/sign.js:XX)
```

问题代码：

```typescript
import { SignJWT } from 'jose';

// Node.js v23 及以下可以工作
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

await new SignJWT({ userId: 123 })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('2h')
  .sign(SECRET);  // ❌ v24 报错
```

## 根因

Node.js v24 对 `crypto` 模块的底层实现进行了调整，jose 库在调用 `SubtleCrypto.importKey()` 时对密钥类型有更严格的校验：

- `Uint8Array` 不再被直接接受
- 必须使用 `KeyObject`（Node.js 原生）或 `CryptoKey`（Web Crypto API）

这是 Node.js 逐步向 Web 标准对齐的结果，影响所有使用原始字节作为密钥的加密操作。

## 解决方案

使用 `crypto.createSecretKey()` 将密钥包装为 `KeyObject`：

```typescript
import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

// ✅ Node.js v24 兼容写法
const SECRET = crypto.createSecretKey(
  new TextEncoder().encode(process.env.JWT_SECRET!)
);

// 签名
export async function signToken(payload: object) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(SECRET);
}

// 验证
export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload;
}
```

**完整示例**：

```typescript
// auth/jwt.ts
import crypto from 'crypto';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not defined');
  return crypto.createSecretKey(new TextEncoder().encode(secret));
};

export async function createToken(payload: JWTPayload): Promise<string> {
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

### Q: Node.js v24 还有哪些 breaking changes？

A: 主要包括：`fs.rmdir` 移除（用 `fs.rm`）、`url.parse` 废弃、以及 Web Crypto API 行为调整。建议查看官方迁移指南。

### Q: jose 和 jsonwebtoken 选哪个？

A: `jose` 是纯 JavaScript 实现，支持更多算法（EdDSA、ECDH），对 Edge Runtime 友好。`jsonwebtoken` 依赖 Node.js 原生模块，在某些部署环境（如 Vercel Edge）不可用。

### Q: RS256 非对称加密也需要这样改吗？

A: 是的。RSA 密钥使用 `crypto.createPrivateKey()` 和 `crypto.createPublicKey()`：

```typescript
const privateKey = crypto.createPrivateKey(process.env.PRIVATE_KEY!);
const publicKey = crypto.createPublicKey(process.env.PUBLIC_KEY!);
```
