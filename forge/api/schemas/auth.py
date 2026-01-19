"""
Authentication and user Pydantic schemas.
"""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, validator


# Auth schemas
class UserLogin(BaseModel):
    """Login request."""
    email: EmailStr
    password: str = Field(min_length=8)


class UserRegister(BaseModel):
    """Registration request."""
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8)
    full_name: str | None = None

    @validator('username')
    def username_alphanumeric(cls, v):
        if not v.isalnum():
            raise ValueError('Username must be alphanumeric')
        return v

    @validator('password')
    def password_complexity(cls, v):
        if not any(char.isdigit() for char in v):
            raise ValueError('Password must contain at least one digit')
        if not any(char.isupper() for char in v):
            raise ValueError('Password must contain at least one uppercase letter')
        return v


class Token(BaseModel):
    """Token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Token refresh request."""
    refresh_token: str


class PasswordChange(BaseModel):
    """Password change request."""
    current_password: str
    new_password: str = Field(min_length=8)


# User schemas
class UserBase(BaseModel):
    """Base user fields."""
    email: EmailStr
    username: str
    full_name: str | None = None


class UserCreate(UserBase):
    """User creation schema."""
    password: str = Field(min_length=8)
    is_active: bool = True
    is_superuser: bool = False


class UserUpdate(BaseModel):
    """User update schema (all optional)."""
    email: EmailStr | None = None
    username: str | None = None
    full_name: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserRead(UserBase):
    """User response schema."""
    id: int
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
