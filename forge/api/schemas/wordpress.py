from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

class WPUser(BaseModel):
    ID: int
    user_login: str
    user_email: str
    display_name: str
    roles: List[str]

class WPUserCreate(BaseModel):
    user_login: str = Field(min_length=3)
    user_email: EmailStr
    role: str = "subscriber"
    password: Optional[str] = None # Optional, if not provided WP generates one? Or we force one? 
    # wp user create automatically generates password if not provided. we usually want to return it or set it.
    # The CLI command user create returns the password if generated? 
    # Actually my service creates it with `--porcelain` which returns ONLY the ID. 
    # So we might not get the password back if auto-generated.
    # Safe bet: force user to provide password OR generating one ourselves and passing it.
    # But for "Magic Login" we don't strictly need a password known to us.
    send_email: bool = False

class MagicLoginResponse(BaseModel):
    url: str
    expires_in: int = 900 # 15 mins default usually
