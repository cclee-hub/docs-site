---
title: 集成 Supabase Auth 到 FastAPI 的三个坑
description: 解决 JWKS 路径 404、ES256 签名验证失败、用户首次登录无本地记录的问题，完整 JWT 验证代码。
date: 2026-03-14
tags: [FastAPI, Supabase, JWT, ai-agent, 认证, saas-development]
authors: [cclee]
schema: Article
---

> 在为客户构建 SaaS 认证系统时遇到此问题，记录根因与解法。

## TL;DR

Supabase Auth + FastAPI 集成有三个常见坑：JWKS 路径不是标准路径、ES256 签名需转换为 DER 格式、用户首次登录时本地数据库无记录。本文提供完整解决方案。


<!-- truncate -->
## 问题现象

### 坑 1：JWKS 路径 404

```bash
GET https://xxx.supabase.co/.well-known/jwks.json
# 404 Not Found
```

所有 JWT 验证请求返回 401 Invalid Token。

### 坑 2：ES256 签名验证失败

```python
from jose import jwt
payload = jwt.decode(token, key, algorithms=["ES256"])
# JWTError: Signature verification failed
```

明明公钥是对的，但签名验证总是失败。

### 坑 3：用户首次登录无本地记录

```python
# 创建 Agent 时
agent = Agent(user_id=current_user["user_id"], ...)
db.add(agent)
# ForeignKeyViolation: user_id 不存在
```

Supabase Auth 用户通过了 JWT 验证，但本地 `agent_users` 表没有该用户记录。

## 根因

### 坑 1：Supabase 非标准 JWKS 路径

标准 OAuth/OIDC 服务器 JWKS 在 `/.well-known/jwks.json`，但 Supabase 把认证服务放在 `/auth/v1/` 子路径下：

| 标准路径 | Supabase 路径 |
|---------|--------------|
| `/.well-known/jwks.json` | `/auth/v1/.well-known/jwks.json` |

### 坑 2：ES256 原始签名 vs DER 格式

Supabase JWT 使用 ES256（P-256 曲线）签名。JWT 中的签名是 **raw 格式**（`r || s` 拼接，64 字节），但 Python `cryptography` 库的 `verify()` 方法需要 **DER-encoded ASN.1 格式**。

```
Raw:     r (32 bytes) || s (32 bytes) = 64 bytes
DER:     0x30 <len> 0x02 <r_len> <r> 0x02 <s_len> <s>
```

`python-jose` 的 `jwt.decode()` 在处理 ES256 时有兼容性问题，需要手动验证签名。

### 坑 3：认证与数据分离

Supabase Auth 是独立服务，用户注册/登录后只存在于 Supabase 的 `auth.users` 表。本地数据库的 `agent_users` 表需要手动同步。

## 解决方案

### 1. 正确的 JWKS URL

```python
# config.py
class Settings(BaseSettings):
    supabase_url: str = "https://xxx.supabase.co"

    @property
    def jwks_url(self) -> str:
        # 关键：/auth/v1/ 前缀
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"
```

### 2. ES256 签名验证（完整代码）

```python
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

def _base64url_decode(data: str) -> bytes:
    """Base64url 解码，自动补 padding"""
    rem = len(data) % 4
    if rem > 0:
        data += "=" * (4 - rem)
    return base64.urlsafe_b64decode(data)

def _raw_to_der_signature(raw_sig: bytes) -> bytes:
    """将 raw ECDSA 签名 (r||s) 转为 DER 格式"""
    # P-256: r 和 s 各 32 字节
    r = int.from_bytes(raw_sig[:32], "big")
    s = int.from_bytes(raw_sig[32:], "big")
    return encode_dss_signature(r, s)

def verify_es256_signature(token: str, public_key_jwk: dict) -> dict:
    """验证 ES256 JWT 签名，返回 payload"""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")

    header_b64, payload_b64, signature_b64 = parts

    # 1. 构建 EC 公钥
    x = _base64url_decode(public_key_jwk["x"])
    y = _base64url_decode(public_key_jwk["y"])
    x_int = int.from_bytes(x, "big")
    y_int = int.from_bytes(y, "big")

    public_key = ec.EllipticCurvePublicNumbers(
        x_int, y_int, ec.SECP256R1()
    ).public_key(default_backend())

    # 2. 验证签名
    message = f"{header_b64}.{payload_b64}".encode()
    raw_signature = _base64url_decode(signature_b64)
    der_signature = _raw_to_der_signature(raw_signature)

    public_key.verify(
        der_signature,
        message,
        ec.ECDSA(hashes.SHA256())
    )

    # 3. 返回 payload
    return json.loads(_base64url_decode(payload_b64))
```

### 3. 用户同步服务

```python
# app/services/user_service.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import AgentUser

async def ensure_user_exists(
    db: AsyncSession,
    user_id: str,
    email: str,
    plan: str = "free"
) -> AgentUser:
    """确保用户存在于本地数据库（从 Supabase Auth 同步）"""
    # 检查是否存在
    result = await db.execute(
        select(AgentUser).where(AgentUser.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if user:
        return user

    # 创建新用户
    user = AgentUser(
        user_id=user_id,
        email=email,
        plan=plan,
        role="user"
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
```

### 4. 在创建资源前调用

```python
# app/routers/agents.py
@router.post("/")
async def create_agent(
    input: CreateAgentInput,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # 关键：确保用户存在
    user = await ensure_user_exists(
        db,
        user_id=current_user["user_id"],
        email=current_user["email"],
        plan=current_user["plan"]
    )

    # 现在可以安全创建 Agent
    agent = Agent(
        user_id=user.user_id,
        name=input.name,
        llm_config=input.llm_config.model_dump()
    )
    ...
```

## FAQ

### Q: Supabase JWT 验证返回 404 怎么办？

A: Supabase 的 JWKS 路径是 `/auth/v1/.well-known/jwks.json`，不是标准的 `/.well-known/jwks.json`。检查你的 JWKS URL 配置。

### Q: python-jose 验证 ES256 签名失败怎么解决？

A: `python-jose` 对 ES256 支持不完善。使用 `cryptography` 库手动验证，需要将 JWT 的 raw 签名（r||s 64字节）转换为 DER 格式。

### Q: FastAPI 如何同步 Supabase Auth 用户到本地数据库？

A: 在需要用户记录的 API（如创建资源）入口处调用 `ensure_user_exists()`，从 JWT 提取用户信息并同步到本地表。

### Q: Supabase JWT 中的 user_id 在哪个字段？

A: `sub` 字段包含用户 UUID，`email` 字段包含邮箱，`app_metadata.plan` 包含订阅计划（自定义字段）。
