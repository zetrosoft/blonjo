import redis
from app.core.config import settings

# Create a connection pool for Redis
# This ensures we don't keep opening and closing connections
redis_pool = redis.ConnectionPool.from_url(
    settings.REDIS_URL, 
    decode_responses=True, # Automatically decode bytes to strings
    max_connections=20
)

def get_redis_client():
    """
    Returns a Redis client instance from the pool.
    """
    return redis.Redis(connection_pool=redis_pool)

# Helper for Caching AI Responses
def get_ai_cache_key(normalized_text: str, system_instruction: str = None) -> str:
    """
    Generates a unique cache key for AI responses.
    """
    import hashlib
    content = f"{normalized_text}:{system_instruction or ''}"
    return f"ai_cache:{hashlib.sha256(content.encode()).hexdigest()}"

import logging
logger = logging.getLogger("sajen.redis")

def invalidate_tenant_cache(tenant_id: int | str | None, entities: list[str] = None):
    """
    Invalidates Redis cache keys for specific entities belonging to a tenant.
    Entities supported: 'products', 'categories', 'uoms', 'contacts', 'dashboard', 'insights', 'material_control'
    """
    if not tenant_id:
        return
    try:
        client = get_redis_client()
        if not client:
            return

        if entities is None:
            entities = ['products', 'categories', 'uoms', 'contacts', 'dashboard', 'insights', 'material_control']

        deleted_count = 0
        for entity in entities:
            patterns = [
                f"{entity}_list:{tenant_id}:*",
                f"{entity}:{tenant_id}:*",
                f"{entity}_matrix:{tenant_id}:*"
            ]
            if entity == 'uoms':
                patterns.append("uoms:*")

            for pattern in patterns:
                keys = client.keys(pattern)
                if keys:
                    client.delete(*keys)
                    deleted_count += len(keys)

        if deleted_count > 0:
            logger.info(f"Invalidated {deleted_count} Redis cache keys for tenant {tenant_id} (entities: {entities})")
    except Exception as e:
        logger.error(f"Error invalidating Redis tenant cache for tenant {tenant_id}: {e}")
