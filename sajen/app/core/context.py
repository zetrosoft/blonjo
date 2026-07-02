from contextvars import ContextVar
from typing import Optional

# Global context for Multi-tenancy
tenant_id_ctx: ContextVar[Optional[int]] = ContextVar("tenant_id", default=None)
user_id_ctx: ContextVar[Optional[int]] = ContextVar("user_id", default=None)

def set_tenant_context(tenant_id: int):
    tenant_id_ctx.set(tenant_id)

def set_user_context(user_id: int):
    user_id_ctx.set(user_id)

def get_tenant_context() -> Optional[int]:
    return tenant_id_ctx.get()

def get_user_context() -> Optional[int]:
    return user_id_ctx.get()
