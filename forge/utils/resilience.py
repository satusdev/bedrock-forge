"""
Resilience utilities for retry mechanisms, error handling, and recovery strategies.
"""
import time
import functools
import inspect
from typing import Any, Callable, Dict, List, Optional, Type, Union, Tuple
from dataclasses import dataclass
from enum import Enum

from forge.utils.errors import ForgeError
from forge.utils.logging import logger


class RetryStrategy(Enum):
    """Different retry strategies."""
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    LINEAR_BACKOFF = "linear_backoff"
    FIXED_DELAY = "fixed_delay"
    IMMEDIATE = "immediate"


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    backoff_factor: float = 2.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF
    jitter: bool = True
    retry_on: Tuple[Type[Exception], ...] = (Exception,)


class CircuitBreakerState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    expected_exception: Type[Exception] = Exception


class CircuitBreaker:
    """Circuit breaker pattern implementation."""

    def __init__(self, config: CircuitBreakerConfig):
        """
        Initialize circuit breaker.

        Args:
            config: Circuit breaker configuration.
        """
        self.config = config
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None

    def __call__(self, func: Callable) -> Callable:
        """Decorator to apply circuit breaker to a function."""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if self.state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    self.state = CircuitBreakerState.HALF_OPEN
                else:
                    raise ForgeError("Circuit breaker is OPEN - service temporarily unavailable")

            try:
                result = func(*args, **kwargs)
                self._on_success()
                return result
            except self.config.expected_exception as e:
                self._on_failure()
                raise ForgeError(f"Service call failed: {e}")

        return wrapper

    def _should_attempt_reset(self) -> bool:
        """Check if circuit breaker should attempt to reset."""
        if self.last_failure_time is None:
            return True
        return time.time() - self.last_failure_time >= self.config.recovery_timeout

    def _on_success(self) -> None:
        """Handle successful call."""
        self.failure_count = 0
        self.state = CircuitBreakerState.CLOSED

    def _on_failure(self) -> None:
        """Handle failed call."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.config.failure_threshold:
            self.state = CircuitBreakerState.OPEN


class RetryManager:
    """Advanced retry management with different strategies."""

    @staticmethod
    def retry_with_config(config: RetryConfig) -> Callable:
        """
        Retry decorator with configuration.

        Args:
            config: Retry configuration.

        Returns:
            Decorator function.
        """
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                last_exception = None
                delay = config.base_delay

                for attempt in range(config.max_attempts):
                    try:
                        return func(*args, **kwargs)
                    except config.retry_on as e:
                        last_exception = e
                        if attempt == config.max_attempts - 1:
                            break

                        logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay:.2f} seconds...")
                        time.sleep(delay)
                        delay = RetryManager._calculate_next_delay(delay, config)

                raise ForgeError(f"All {config.max_attempts} attempts failed. Last error: {last_exception}")

            return wrapper
        return decorator

    @staticmethod
    def retry(
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF,
        backoff_factor: float = 2.0,
        jitter: bool = True,
        exceptions: Tuple[Type[Exception], ...] = (Exception,)
    ) -> Callable:
        """
        Retry decorator with parameters.

        Args:
            max_attempts: Maximum number of retry attempts.
            base_delay: Initial delay between retries.
            max_delay: Maximum delay between retries.
            strategy: Retry strategy to use.
            backoff_factor: Factor for exponential backoff.
            jitter: Whether to add jitter to delay.
            exceptions: Tuple of exceptions to retry on.

        Returns:
            Decorator function.
        """
        config = RetryConfig(
            max_attempts=max_attempts,
            base_delay=base_delay,
            max_delay=max_delay,
            strategy=strategy,
            backoff_factor=backoff_factor,
            jitter=jitter,
            retry_on=exceptions
        )
        return RetryManager.retry_with_config(config)

    @staticmethod
    def _calculate_next_delay(current_delay: float, config: RetryConfig) -> float:
        """Calculate next delay based on strategy."""
        if config.strategy == RetryStrategy.EXPONENTIAL_BACKOFF:
            next_delay = current_delay * config.backoff_factor
        elif config.strategy == RetryStrategy.LINEAR_BACKOFF:
            next_delay = current_delay + config.base_delay
        elif config.strategy == RetryStrategy.FIXED_DELAY:
            next_delay = config.base_delay
        else:  # IMMEDIATE
            return 0

        next_delay = min(next_delay, config.max_delay)

        if config.jitter:
            # Add jitter to prevent thundering herd
            import random
            jitter_amount = next_delay * 0.1
            next_delay += random.uniform(-jitter_amount, jitter_amount)

        return max(0, next_delay)


class ErrorHandler:
    """Centralized error handling and recovery strategies."""

    @staticmethod
    def safe_execute(
        func: Callable,
        default_value: Any = None,
        exceptions: Tuple[Type[Exception], ...] = (Exception,),
        error_message: Optional[str] = None,
        log_error: bool = True
    ) -> Any:
        """
        Safely execute a function with error handling.

        Args:
            func: Function to execute.
            default_value: Value to return on error.
            exceptions: Exceptions to catch.
            error_message: Custom error message.
            log_error: Whether to log the error.

        Returns:
            Function result or default value.
        """
        try:
            return func()
        except exceptions as e:
            if log_error:
                message = error_message or f"Function {func.__name__} failed: {e}"
                logger.error(message)
            return default_value

    @staticmethod
    def fallback_chain(*funcs: Callable) -> Callable:
        """
        Create a fallback chain of functions.

        Args:
            *funcs: Functions to try in order.

        Returns:
            Function that tries each function until one succeeds.
        """
        def wrapper(*args, **kwargs):
            last_exception = None
            for func in funcs:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(f"Fallback function {func.__name__} failed: {e}")
            raise ForgeError(f"All fallback functions failed. Last error: {last_exception}")

        return wrapper

    @staticmethod
    def timeout(seconds: float) -> Callable:
        """
        Timeout decorator for functions.

        Args:
            seconds: Timeout in seconds.

        Returns:
            Decorated function.
        """
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                import signal
                import threading

                result = [None]
                exception = [None]

                def target():
                    try:
                        result[0] = func(*args, **kwargs)
                    except Exception as e:
                        exception[0] = e

                thread = threading.Thread(target=target)
                thread.daemon = True
                thread.start()
                thread.join(seconds)

                if thread.is_alive():
                    raise ForgeError(f"Function {func.__name__} timed out after {seconds} seconds")

                if exception[0]:
                    raise exception[0]

                return result[0]

            return wrapper
        return decorator


class ResourcePool:
    """Resource pool for managing limited resources like database connections."""

    def __init__(self, max_size: int = 10, factory: Callable = None):
        """
        Initialize resource pool.

        Args:
            max_size: Maximum pool size.
            factory: Function to create new resources.
        """
        self.max_size = max_size
        self.factory = factory or (lambda: None)
        self.pool = []
        self.in_use = set()
        self.lock = threading.Lock()

    def acquire(self, timeout: float = 30.0) -> Any:
        """
        Acquire a resource from the pool.

        Args:
            timeout: Maximum time to wait for resource.

        Returns:
            Resource instance.

        Raises:
            ForgeError: If timeout is reached.
        """
        import threading

        start_time = time.time()
        while time.time() - start_time < timeout:
            with self.lock:
                if self.pool:
                    resource = self.pool.pop()
                    self.in_use.add(resource)
                    return resource
                elif len(self.in_use) < self.max_size:
                    resource = self.factory()
                    self.in_use.add(resource)
                    return resource

            time.sleep(0.1)

        raise ForgeError(f"Resource pool timeout after {timeout} seconds")

    def release(self, resource: Any) -> None:
        """
        Release a resource back to the pool.

        Args:
            resource: Resource to release.
        """
        with self.lock:
            if resource in self.in_use:
                self.in_use.remove(resource)
                self.pool.append(resource)


class HealthChecker:
    """Health checking utilities for external services."""

    @staticmethod
    def check_service_health(
        check_func: Callable,
        expected_result: Any = True,
        timeout: float = 10.0,
        retries: int = 3
    ) -> bool:
        """
        Check if a service is healthy.

        Args:
            check_func: Function that performs health check.
            expected_result: Expected result from check function.
            timeout: Timeout for each check.
            retries: Number of retries.

        Returns:
            True if service is healthy, False otherwise.
        """
        for attempt in range(retries):
            try:
                result = ErrorHandler.timeout(timeout)(check_func)()
                return result == expected_result
            except Exception as e:
                if attempt == retries - 1:
                    logger.error(f"Health check failed after {retries} attempts: {e}")
                else:
                    logger.warning(f"Health check attempt {attempt + 1} failed: {e}")
                    time.sleep(1)

        return False

    @staticmethod
    def wait_for_service(
        check_func: Callable,
        timeout: float = 300.0,
        interval: float = 5.0
    ) -> bool:
        """
        Wait for a service to become healthy.

        Args:
            check_func: Function that checks service health.
            timeout: Maximum time to wait.
            interval: Check interval.

        Returns:
            True if service became healthy, False if timeout reached.
        """
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                if check_func():
                    return True
            except Exception as e:
                logger.debug(f"Service not ready yet: {e}")

            time.sleep(interval)

        logger.error(f"Service did not become healthy within {timeout} seconds")
        return False


# Predefined retry configurations for common use cases
NETWORK_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    base_delay=1.0,
    max_delay=30.0,
    strategy=RetryStrategy.EXPONENTIAL_BACKOFF,
    retry_on=(ConnectionError, TimeoutError, OSError)
)

COMPOSER_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    base_delay=5.0,
    max_delay=60.0,
    strategy=RetryStrategy.LINEAR_BACKOFF,
    retry_on=(ForgeError,)
)

GITHUB_API_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    base_delay=2.0,
    max_delay=30.0,
    strategy=RetryStrategy.EXPONENTIAL_BACKOFF,
    retry_on=(ConnectionError, TimeoutError)
)

FILE_OPERATION_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    base_delay=0.5,
    max_delay=10.0,
    strategy=RetryStrategy.LINEAR_BACKOFF,
    retry_on=(IOError, OSError)
)