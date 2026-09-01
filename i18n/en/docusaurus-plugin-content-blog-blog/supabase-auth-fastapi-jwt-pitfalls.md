---
title: "Three Pitfalls Integrating Supabase Auth with FastAPI"
description: "Fix the non-standard JWKS path, ES256 signature verification failures, and missing local user records on first login — with complete JWT verification code."
date: 2026-03-14
tags: [FastAPI, Supabase, JWT, Authentication, saas-development]
authors: [cclee]
schema: Article
---

> Encountered this while building a SaaS authentication system for a client — recording the root causes and fixes.

## TL;DR

Supabase Auth + FastAPI integration has three common pitfalls: the JWKS path is not the standard one, ES256 signatures need conversion to DER format, and first-time users have no local database record. Complete solutions below.


<!-- truncate -->
## The symptoms

### Pitfall 1: JWKS path 404

```bash
GET https://xxx.supabase.co/.well-known/jwks.json
# 404 Not Found
```

Every JWT verification request returns 401 Invalid Token.

### Pitfall 2: ES256 signature verification fails

```python
from jose import jwt
payload = jwt.decode(token, key, algorithms=["ES256"])
# JWTError: Signature verification failed
```

The public key is correct, yet verification always fails.

### Pitfall 3: no local record for first-time users

```python
# When creating an Agent
agent = Agent(user_id=current_user["user_id"], ...)
db.add(agent)
# ForeignKeyViolation: user_id does not exist
```

The user passes JWT verification against Supabase Auth, but the local `agent_users` table has no such record.

## Root causes

### Pitfall 1: Supabase's non-standard JWKS path

Standard OAuth/OIDC servers expose JWKS at `/.well-known/jwks.json`, but Supabase nests its auth service under `/auth/v1/`:

| Standard path | Supabase path |
|---------------|---------------|
| `/.well-known/jwks.json` | `/auth/v1/.well-known/jwks.json` |

### Pitfall 2: raw ES256 signatures vs. DER format

Supabase JWTs are signed with ES256 (P-256 curve). The signature inside a JWT is **raw format** (`r || s` concatenated, 64 bytes), but the Python `cryptography` library's `verify()` expects a **DER-encoded ASN.1 signature**.

```
Raw:     r (32 bytes) || s (32 bytes) = 64 bytes
DER:     0x30 <len> 0x02 <r_len> <r> 0x02 <s_len> <s>
```

`python-jose`'s `jwt.decode()` has compatibility issues with ES256 — verify the signature manually instead.

### Pitfall 3: authentication and data live apart

Supabase Auth is a separate service; after signup/login the user exists only in Supabase's `auth.users`. The local `agent_users` table must be synced manually.

## Fixes

### 1. The correct JWKS URL

```python
# config.py
class Settings(BaseSettings):
    supabase_url: str = "https://xxx.supabase.co"

    @property
    def jwks_url(self) -> str:
        # key detail: the /auth/v1/ prefix
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"
```

### 2. ES256 signature verification (complete code)

```python
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

def _base64url_decode(data: str) -> bytes:
    """Base64url decode with automatic padding"""
    rem = len(data) % 4
    if rem > 0:
        data += "=" * (4 - rem)
    return base64.urlsafe_b64decode(data)

def _raw_to_der_signature(raw_sig: bytes) -> bytes:
    """Convert a raw ECDSA signature (r||s) to DER format"""
    # P-256: r and s are 32 bytes each
    r = int.from_bytes(raw_sig[:32], "big")
    s = int.from_bytes(raw_sig[32:], "big")
    return encode_dss_signature(r, s)

def verify_es256_signature(token: str, public_key_jwk: dict) -> dict:
    """Verify an ES256 JWT signature, return the payload"""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")

    header_b64, payload_b64, signature_b64 = parts

    # 1. build the EC public key
    x = _base64url_decode(public_key_jwk["x"])
    y = _base64url_decode(public_key_jwk["y"])
    x_int = int.from_bytes(x, "big")
    y_int = int.from_bytes(y, "big")

    public_key = ec.EllipticCurvePublicNumbers(
        x_int, y_int, ec.SECP256R1()
    ).public_key(default_backend())

    # 2. verify the signature
    message = f"{header_b64}.{payload_b64}".encode()
    raw_signature = _base64url_decode(signature_b64)
    der_signature = _raw_to_der_signature(raw_signature)

    public_key.verify(
        der_signature,
        message,
        ec.ECDSA(hashes.SHA256())
    )

    # 3. return the payload
    return json.loads(_base64url_decode(payload_b64))
```

### 3. User sync service

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
    """Ensure the user exists locally (synced from Supabase Auth)"""
    result = await db.execute(
        select(AgentUser).where(AgentUser.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if user:
        return user

    # create the new user
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

### 4. Call it before creating any user-owned resource

```python
# app/routers/agents.py
@router.post("/")
async def create_agent(
    input: CreateAgentInput,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # key step: ensure the user exists
    user = await ensure_user_exists(
        db,
        user_id=current_user["user_id"],
        email=current_user["email"],
        plan=current_user["plan"]
    )

    # now creating the Agent is safe
    agent = Agent(
        user_id=user.user_id,
        name=input.name,
        llm_config=input.llm_config.model_dump()
    )
    ...
```

## FAQ

### Supabase JWT verification returns 404 — what now?

Supabase's JWKS lives at `/auth/v1/.well-known/jwks.json`, not the standard `/.well-known/jwks.json`. Check your JWKS URL configuration.

### python-jose fails to verify ES256 signatures — how to fix?

`python-jose`'s ES256 support is incomplete. Verify manually with the `cryptography` library, converting the JWT's raw signature (r||s, 64 bytes) to DER format first.

### How do I sync Supabase Auth users into my FastAPI database?

Call `ensure_user_exists()` at the entry points that need a local user record (e.g. resource creation), extracting user info from the JWT and syncing it into the local table.

### Where is the user_id inside a Supabase JWT?

The `sub` field holds the user UUID, `email` holds the address, and `app_metadata.plan` holds the subscription plan (a custom field).
