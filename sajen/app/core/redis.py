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
