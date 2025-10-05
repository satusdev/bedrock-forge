"""
Retry utilities for handling temporary failures.

This module provides decorators and utilities for retrying operations that might fail
due to temporary issues like network problems or service unavailability.
"""

import time
import functools
import logging
from typing import Callable, Type, Union, List, Any, Dict, Optional
from enum import Enum

from .exceptions import RetryableError, TemporaryNetworkError, ServiceUnavailableError
from .logging import logger


class BackoffStrategy(Enum):
    """Retry backoff strategies."""
    FIXED = "fixed"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    FIBONACCI = "fibonacci"


class RetryCondition:
    """Condition for when to retry an operation."""

    def __init__(
        self,
        exception_types: Union[Type[Exception], List[Type[Exception]]],
        max_retries: int = 3,
        backoff_strategy: BackoffStrategy = BackoffStrategy.LINEAR,
        initial_delay: float = 1.0,
        max_delay: float = 60.0,
        retry_on_result: Optional[Callable[[Any], bool]] = None
    ):
        if isinstance(exception_types, type):
            exception_types = [exception_types]

        self.exception_types = exception_types
        self.max_retries = max_retries
        self.backoff_strategy = backoff_strategy
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.retry_on_result = retry_on_result

    def should_retry(self, attempt: int, exception: Optional[Exception] = None, result: Any = None) -> bool:
        """Determine if the operation should be retried."""
        if attempt > self.max_retries:
            return False

        if exception is not None:
            return any(isinstance(exception, exc_type) for exc_type in self.exception_types)

        if result is not None and self.retry_on_result is not None:
            return self.retry_on_result(result)

        return False

    def get_delay(self, attempt: int) -> float:
        """Calculate delay before next retry attempt."""
        if self.backoff_strategy == BackoffStrategy.FIXED:
            delay = self.initial_delay
        elif self.backoff_strategy == BackoffStrategy.LINEAR:
            delay = self.initial_delay * attempt
        elif self.backoff_strategy == BackoffStrategy.EXPONENTIAL:
            delay = self.initial_delay * (2 ** (attempt - 1))
        elif self.backoff_strategy == BackoffStrategy.FIBONACCI:
            a, b = 0, 1
            for _ in range(attempt - 1):
                a, b = b, a + b
            delay = self.initial_delay * b
        else:
            delay = self.initial_delay

        return min(delay, self.max_delay)


def retry(
    condition: Optional[RetryCondition] = None,
    exception_types: Optional[Union[Type[Exception], List[Type[Exception]]]] = None,
    max_retries: int = 3,
    backoff_strategy: BackoffStrategy = BackoffStrategy.LINEAR,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    retry_on_result: Optional[Callable[[Any], bool]] = None,
    logger: Optional[logging.Logger] = None
):
    """
    Decorator to retry a function when it fails.

    Args:
        condition: RetryCondition object defining retry behavior
        exception_types: Exception types that should trigger a retry
        max_retries: Maximum number of retry attempts
        backoff_strategy: Strategy for calculating delay between retries
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        retry_on_result: Function to check if result should trigger a retry
        logger: Logger instance for logging retry attempts
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Create retry condition if not provided
            if condition is None:
                if exception_types is None:
                    exception_types = [RetryableError, TemporaryNetworkError, ServiceUnavailableError]
                retry_condition = RetryCondition(
                    exception_types=exception_types,
                    max_retries=max_retries,
                    backoff_strategy=backoff_strategy,
                    initial_delay=initial_delay,
                    max_delay=max_delay,
                    retry_on_result=retry_on_result
                )
            else:
                retry_condition = condition

            last_exception = None
            last_result = None
            actual_logger = logger or globals().get('logger', logging.getLogger(__name__))

            for attempt in range(1, retry_condition.max_retries + 2):  # +1 for initial attempt
                try:
                    result = func(*args, **kwargs)
                    if retry_condition.should_retry(attempt, None, result):
                        if actual_logger:
                            actual_logger.warning(
                                f"Retry attempt {attempt}/{retry_condition.max_retries} "
                                f"for {func.__name__} due to result condition"
                            )
                        delay = retry_condition.get_delay(attempt)
                        if delay > 0:
                            time.sleep(delay)
                        continue
                    return result

                except tuple(retry_condition.exception_types) as e:
                    last_exception = e

                    if retry_condition.should_retry(attempt, e, None):
                        if actual_logger:
                            actual_logger.warning(
                                f"Retry attempt {attempt}/{retry_condition.max_retries} "
                                f"for {func.__name__} after {type(e).__name__}: {e}"
                            )
                        delay = retry_condition.get_delay(attempt)
                        if delay > 0:
                            time.sleep(delay)
                        continue
                    else:
                        # Re-raise if we shouldn't retry or have exhausted retries
                        raise

            # If we get here, we've exhausted retries
            if last_exception is not None:
                raise last_exception
            else:
                # This should be unreachable, but just in case
                raise RuntimeError(f"Unexpected retry failure for {func.__name__}")

        return wrapper
    return decorator


def retry_with_jitter(
    condition: Optional[RetryCondition] = None,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter_factor: float = 0.1,
    **kwargs
):
    """
    Retry decorator with jitter to avoid thundering herd problems.

    Args:
        condition: RetryCondition object
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        jitter_factor: Factor for random jitter (0.0 to 1.0)
        **kwargs: Additional arguments passed to retry decorator
    """
    import random

    def jitter_delay(attempt: int, base_delay: float) -> float:
        """Calculate delay with jitter."""
        jitter = base_delay * jitter_factor * (random.random() * 2 - 1)  # -jitter to +jitter
        return max(0, base_delay + jitter)

    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Create a custom retry condition that adds jitter
            if condition is None:
                retry_condition = RetryCondition(
                    exception_types=[RetryableError, TemporaryNetworkError, ServiceUnavailableError],
                    max_retries=max_retries,
                    initial_delay=initial_delay,
                    max_delay=max_delay
                )
            else:
                retry_condition = condition

            # Override the get_delay method to add jitter
            original_get_delay = retry_condition.get_delay

            def get_delay_with_jitter(attempt: int) -> float:
                base_delay = original_get_delay(attempt)
                return jitter_delay(attempt, base_delay)

            retry_condition.get_delay = get_delay_with_jitter

            return retry(condition=retry_condition, **kwargs)(func)(*args, **kwargs)

        return wrapper
    return decorator


def circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout: float = 60.0,
    expected_exception: Union[Type[Exception], List[Type[Exception]]] = Exception,
    logger: Optional[logging.Logger] = None
):
    """
    Circuit breaker decorator to prevent cascading failures.

    Args:
        failure_threshold: Number of failures before opening circuit
        recovery_timeout: Seconds to wait before attempting recovery
        expected_exception: Exception types that should trigger circuit opening
        logger: Logger instance for logging circuit state changes
    """
    def decorator(func: Callable):
        state = {
            'failure_count': 0,
            'last_failure_time': None,
            'circuit_open': False,
            'next_attempt_time': None
        }
        actual_logger = logger or globals().get('logger', logging.getLogger(__name__))

        if isinstance(expected_exception, type):
            expected_exception = [expected_exception]

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            import time

            current_time = time.time()

            # Check if circuit is open and if recovery timeout has passed
            if state['circuit_open']:
                if state['next_attempt_time'] and current_time < state['next_attempt_time']:
                    raise ServiceUnavailableError(
                        f"Circuit breaker is open for {func.__name__}. "
                        f"Try again in {state['next_attempt_time'] - current_time:.1f} seconds."
                    )
                else:
                    # Attempt recovery
                    if actual_logger:
                        actual_logger.info(f"Attempting recovery for {func.__name__}")

            try:
                result = func(*args, **kwargs)
                # Reset on success
                if state['circuit_open']:
                    if actual_logger:
                        actual_logger.info(f"Circuit closed for {func.__name__} after successful recovery")
                    state['failure_count'] = 0
                    state['circuit_open'] = False
                    state['next_attempt_time'] = None
                return result

            except tuple(expected_exception) as e:
                state['failure_count'] += 1
                state['last_failure_time'] = current_time

                if state['failure_count'] >= failure_threshold:
                    state['circuit_open'] = True
                    state['next_attempt_time'] = current_time + recovery_timeout

                    if actual_logger:
                        actual_logger.warning(
                            f"Circuit breaker opened for {func.__name__} after {failure_threshold} failures. "
                            f"Will attempt recovery in {recovery_timeout} seconds."
                        )

                raise

        return wrapper
    return decorator


# Common retry conditions for different scenarios
NETWORK_RETRY_CONDITION = RetryCondition(
    exception_types=[TemporaryNetworkError, ConnectionError],
    max_retries=5,
    backoff_strategy=BackoffStrategy.EXPONENTIAL,
    initial_delay=1.0,
    max_delay=30.0
)

SERVICE_RETRY_CONDITION = RetryCondition(
    exception_types=[ServiceUnavailableError],
    max_retries=3,
    backoff_strategy=BackoffStrategy.LINEAR,
    initial_delay=5.0,
    max_delay=60.0
)

FILE_OPERATION_RETRY_CONDITION = RetryCondition(
    exception_types=[PermissionError, FileNotFoundError, IOError],
    max_retries=3,
    backoff_strategy=BackoffStrategy.FIXED,
    initial_delay=0.5,
    max_delay=5.0
)


# Common retry decorators
@retry(condition=NETWORK_RETRY_CONDITION)
def retry_network_operation(func: Callable, *args, **kwargs):
    """Decorator for retrying network operations."""
    return func(*args, **kwargs)


@retry(condition=SERVICE_RETRY_CONDITION)
def retry_service_operation(func: Callable, *args, **kwargs):
    """Decorator for retrying service operations."""
    return func(*args, **kwargs)


@retry(condition=FILE_OPERATION_RETRY_CONDITION)
def retry_file_operation(func: Callable, *args, **kwargs):
    """Decorator for retrying file operations."""
    return func(*args, **kwargs)