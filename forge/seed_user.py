
import asyncio
import secrets
import string
import sys
import os
from datetime import datetime

# Add app to path
sys.path.append(os.getcwd())

from forge.db.models.user import User
from forge.db.models.server import Server, ServerProvider, ServerStatus, PanelType
from forge.api.security import hash_password
from forge.db import AsyncSessionLocal
from sqlalchemy import select


# CyberPanel server configurations
CYBERPANEL_SERVERS = [
    {
        "name": "CP Staging",
        "hostname": "78.47.141.179",
        "panel_url": "https://cp.staging.ly/",
        "ssh_password": "s9!Y54qcn@PjiGPd5o4*opqr#B", # Assuming this was the password previously used
    },
    {
        "name": "CP LamaHost",
        "hostname": "78.46.41.81",
        "panel_url": "https://cp.lamahost.ly/",
        "ssh_password": "qWTL4GShbB7%!8a^Ks9T",
    },
    {
        "name": "CP Lamah",
        "hostname": "128.140.1.61",
        "panel_url": "https://cp.lamah.ly/",
        "ssh_password": "TY42fhWrpOXuV^IN*vhT93Xi",
    },
]


async def seed_servers(owner_id: int, db):
    """Seed CyberPanel servers."""
    servers_created = 0
    
    for server_config in CYBERPANEL_SERVERS:
        # Check if server already exists by hostname
        result = await db.execute(
            select(Server).where(Server.hostname == server_config["hostname"])
        )
        existing = result.scalars().first()
        
        if existing:
            print(f"  Server {server_config['name']} ({server_config['hostname']}) already exists - updating credentials")
            # Update credentials in case they changed
            existing.ssh_password = server_config["ssh_password"]
            existing.panel_url = server_config["panel_url"]
            existing.panel_verified = False  # Re-verify with new credentials
        else:
            print(f"  Creating server: {server_config['name']}")
            server = Server(
                name=server_config["name"],
                hostname=server_config["hostname"],
                provider=ServerProvider.CYBERPANEL,
                status=ServerStatus.ONLINE,
                panel_type=PanelType.CYBERPANEL,
                panel_url=server_config["panel_url"],
                panel_port=8090,
                panel_verified=False,
                owner_id=owner_id,
                ssh_user="root",
                ssh_port=22,
                ssh_password=server_config["ssh_password"]
            )
            db.add(server)
            servers_created += 1
    
    await db.commit()
    return servers_created


async def seed_user():
    email = "wd@lamah.com"
    username = "default_admin"
    
    # Generate random password
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for i in range(12))
    
    async with AsyncSessionLocal() as db:
        # Check if user exists
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if user:
            print(f"User {email} already exists.")
            # For security/convenience in this dev context, we could reset password
            # But the request says "always have it so we can login", implies creating if missing.
            # If exists, we might not know the old password. 
            # Let's reset it to the new random one so the user definitely has access.
            user.hashed_password = hash_password(password)
            user.is_active = True
            user.is_superuser = True # Assuming admin rights needed to "add other users" as requested
            print(f"Resetting password for existing user {email}")
        else:
            print(f"Creating new user {email}")
            user = User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                is_active=True,
                is_superuser=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(user)
            
        await db.commit()
        await db.refresh(user)
        
        # Seed CyberPanel servers
        print("\nSeeding CyberPanel servers...")
        servers_created = await seed_servers(user.id, db)
        
        print("\n" + "="*50)
        print(f"LOGIN CREDENTIALS")
        print(f"Email:    {email}")
        print(f"Password: {password}")
        print("="*50)
        print(f"\nServers: {servers_created} new server(s) created")
        print("="*50 + "\n")

if __name__ == "__main__":
    asyncio.run(seed_user())

