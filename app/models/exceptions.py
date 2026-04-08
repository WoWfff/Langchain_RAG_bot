# ========================================================
#                       BASE
# ========================================================


class DatabaseException(Exception):
    pass


# ========================================================
#                       USER
# ========================================================


class UserException(DatabaseException):
    pass


class UserNotFoundError(UserException):
    """Raised when user is not found"""

    def __init__(self, user_id: int | None = None, cookies_id: str | None = None):
        self.user_id = user_id
        self.cookies_id = cookies_id
        if user_id:
            super().__init__(f"User with id {user_id} not found")
        elif cookies_id:
            super().__init__(f"User with cookies_id '{cookies_id}' not found")
        else:
            super().__init__("User not found")


class UserWithCookiesExists(UserException):
    """Raised when user with cookies_id already exists"""

    def __init__(self, user_id: int, cookies_id: str):
        self.user_id = user_id
        self.cookies_id = cookies_id
        super().__init__(f"User {user_id} with cookies_id '{cookies_id}' already exists")


# ========================================================
#                       THREAD
# ========================================================


class ThreadException(DatabaseException):
    pass


class ThreadAlreadyExistsError(ThreadException):
    """Raised when thread with thread_id already exists"""

    def __init__(self, thread_id: str):
        self.thread_id = thread_id
        super().__init__(f"Thread with thread_id '{thread_id}' already exists")


class ThreadNotFoundOrDoestBelongError(ThreadException):
    """Raised when thread is not found or doesn't belong to user"""

    def __init__(self, user_id: int, thread_id: str):
        self.user_id = user_id
        self.thread_id = thread_id
        super().__init__(f"Thread '{thread_id}' not found or doesn't belong to user {user_id}")


class ThreadNotFoundError(ThreadException):
    """Raised when thread is not found"""

    def __init__(self, thread_id: str):
        self.thread_id = thread_id
        super().__init__(f"Thread '{thread_id}' not found")


class ActiveThreadError(ThreadException):
    """Raised when trying delete active thread"""

    def __init__(self, thread_id: str):
        self.thread_id = thread_id
        super().__init__(f"Cannot delete active thread ({thread_id}). Switch to another thread first.")


# ========================================================
#                       AGENT
# ========================================================


class AgentException(Exception):
    """Base exception for agent-related operations"""

    pass


class AgentHistoryError(AgentException):
    """Raised when failed to get thread history"""

    def __init__(self, thread_id: str, original_error: Exception | None = None):
        self.thread_id = thread_id
        self.original_error = original_error
        super().__init__(f"Failed to get history for thread '{thread_id}'")


class AgentProcessingError(AgentException):
    """Raised when agent fails to process message"""

    def __init__(self, message: str = "Agent failed to process message", original_error: Exception | None = None):
        self.original_error = original_error
        super().__init__(message)


class InvalidAgentResponseError(AgentException):
    """Raised when agent returns invalid response"""

    def __init__(self, message: str = "Invalid agent response format"):
        super().__init__(message)
