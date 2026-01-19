"""
Rate limiting configuration for API endpoints.

Uses slowapi for request rate limiting.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def get_real_client_ip(request: Request) -> str:
    """Get real client IP, considering proxies."""
    # Check X-Forwarded-For header first (for reverse proxies)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fall back to direct client IP
    return get_remote_address(request)


# Create limiter instance
limiter = Limiter(key_func=get_real_client_ip)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Custom handler for rate limit exceeded."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "retry_after": exc.detail
        }
    )


# Rate limit decorators for common use cases
def limit_login(func):
    """5 login attempts per minute per IP."""
    return limiter.limit("5/minute")(func)


def limit_register(func):
    """3 registration attempts per minute per IP."""
    return limiter.limit("3/minute")(func)


def limit_api(func):
    """100 requests per minute for general API."""
    return limiter.limit("100/minute")(func)
