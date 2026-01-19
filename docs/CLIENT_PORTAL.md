# Client Portal Guide

Guide for client portal setup and usage.

## Overview

The client portal allows your clients to:
- View their projects
- Access invoices
- Submit support tickets
- Check site status

## Setup

### 1. Create Client User

```python
from forge.db.models import ClientUser
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"])

client_user = ClientUser(
    client_id=1,  # Link to existing client
    email="client@example.com",
    password_hash=pwd.hash("secure_password"),
    full_name="John Doe"
)
```

### 2. Client Login

```bash
curl -X POST http://localhost:8000/api/client/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "client@example.com", "password": "secure_password"}'
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "client_id": 1,
  "client_name": "Acme Corp"
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/client/auth/login` | Login |
| GET | `/api/client/projects` | List projects |
| GET | `/api/client/invoices` | List invoices |
| GET | `/api/client/tickets` | List tickets |
| POST | `/api/client/tickets` | Create ticket |
| GET | `/api/client/tickets/{id}` | Get ticket |
| POST | `/api/client/tickets/{id}/reply` | Reply to ticket |

## Authentication

Use the `Authorization: Bearer <token>` header for all requests:

```bash
curl http://localhost:8000/api/client/projects \
  -H "Authorization: Bearer eyJ..."
```

## Ticket System

### Create Ticket
```json
{
  "subject": "Website issue",
  "message": "My website is loading slowly...",
  "priority": "medium",
  "project_id": 1
}
```

### Priorities
- `low` - General questions
- `medium` - Standard support
- `high` - Important issues
- `urgent` - Critical problems

### Statuses
- `open` - New ticket
- `in_progress` - Being worked on
- `waiting_reply` - Awaiting client response
- `resolved` - Issue fixed
- `closed` - Ticket closed

## Security Notes

- Client tokens are separate from admin tokens
- Clients can only view their own data
- Passwords are bcrypt hashed
