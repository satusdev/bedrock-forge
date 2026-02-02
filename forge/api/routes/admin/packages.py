"""
Hosting Package API routes.

Manages hosting package definitions with pricing tiers.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from typing import Dict, Any, List, Optional, Annotated
from pydantic import BaseModel

from ....utils.logging import logger
from ....db import get_db
from ....db.models import HostingPackage

router = APIRouter()


# Pydantic models
class PackageCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    disk_space_gb: int = 10
    bandwidth_gb: int = 100
    domains_limit: int = 1
    databases_limit: int = 1
    email_accounts_limit: int = 5
    monthly_price: float = 0.0
    quarterly_price: float = 0.0
    yearly_price: float = 0.0
    biennial_price: float = 0.0
    setup_fee: float = 0.0
    currency: str = "USD"
    hosting_yearly_price: float = 0.0
    support_monthly_price: float = 0.0
    features: Optional[List[str]] = None
    is_featured: bool = False


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    disk_space_gb: Optional[int] = None
    bandwidth_gb: Optional[int] = None
    domains_limit: Optional[int] = None
    databases_limit: Optional[int] = None
    email_accounts_limit: Optional[int] = None
    monthly_price: Optional[float] = None
    quarterly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    biennial_price: Optional[float] = None
    setup_fee: Optional[float] = None
    currency: Optional[str] = None
    hosting_yearly_price: Optional[float] = None
    support_monthly_price: Optional[float] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


async def _seed_default_packages(db: AsyncSession) -> None:
    """Seed default LYD hosting/support packages if none exist."""
    count_stmt = select(func.count()).select_from(HostingPackage)
    total = (await db.execute(count_stmt)).scalar() or 0
    if total > 0:
        return

    defaults = [
        {
            "name": "Starter",
            "slug": "starter",
            "description": "Starter hosting plan",
            "hosting_yearly_price": 350.0,
            "support_monthly_price": 500.0,
            "disk_space_gb": 10,
            "bandwidth_gb": 100,
            "domains_limit": 1,
            "databases_limit": 1,
            "email_accounts_limit": 5,
            "currency": "LYD",
            "sort_order": 1,
        },
        {
            "name": "Bronze",
            "slug": "bronze",
            "description": "Bronze hosting plan",
            "hosting_yearly_price": 500.0,
            "support_monthly_price": 700.0,
            "disk_space_gb": 20,
            "bandwidth_gb": 200,
            "domains_limit": 3,
            "databases_limit": 3,
            "email_accounts_limit": 10,
            "currency": "LYD",
            "sort_order": 2,
        },
        {
            "name": "Silver",
            "slug": "silver",
            "description": "Silver hosting plan",
            "hosting_yearly_price": 700.0,
            "support_monthly_price": 1000.0,
            "disk_space_gb": 50,
            "bandwidth_gb": 500,
            "domains_limit": 5,
            "databases_limit": 5,
            "email_accounts_limit": 20,
            "currency": "LYD",
            "sort_order": 3,
        },
        {
            "name": "Gold",
            "slug": "gold",
            "description": "Gold hosting plan",
            "hosting_yearly_price": 1000.0,
            "support_monthly_price": 1500.0,
            "disk_space_gb": 100,
            "bandwidth_gb": 1000,
            "domains_limit": 10,
            "databases_limit": 10,
            "email_accounts_limit": 50,
            "currency": "LYD",
            "sort_order": 4,
            "is_featured": True,
        },
    ]

    for item in defaults:
        package = HostingPackage(
            name=item["name"],
            slug=item["slug"],
            description=item["description"],
            disk_space_gb=item["disk_space_gb"],
            bandwidth_gb=item["bandwidth_gb"],
            domains_limit=item["domains_limit"],
            databases_limit=item["databases_limit"],
            email_accounts_limit=item["email_accounts_limit"],
            monthly_price=0.0,
            yearly_price=item["hosting_yearly_price"],
            currency=item["currency"],
            hosting_yearly_price=item["hosting_yearly_price"],
            support_monthly_price=item["support_monthly_price"],
            is_featured=item.get("is_featured", False),
            sort_order=item["sort_order"],
        )
        db.add(package)

    await db.commit()


@router.get("/")
async def list_packages(
    is_active: bool = True,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """List all hosting packages."""
    try:
        await _seed_default_packages(db)
        stmt = select(HostingPackage)
        
        if is_active is not None:
            stmt = stmt.where(HostingPackage.is_active == is_active)
        
        stmt = stmt.order_by(HostingPackage.sort_order, HostingPackage.yearly_price)
        result = await db.execute(stmt)
        packages = result.scalars().all()
        
        return {
            "packages": [
                {
                    "id": p.id,
                    "name": p.name,
                    "slug": p.slug,
                    "description": p.description,
                    "disk_space_gb": p.disk_space_gb,
                    "bandwidth_gb": p.bandwidth_gb,
                    "domains_limit": p.domains_limit,
                    "databases_limit": p.databases_limit,
                    "email_accounts_limit": p.email_accounts_limit,
                    "monthly_price": p.monthly_price,
                    "quarterly_price": p.quarterly_price,
                    "yearly_price": p.yearly_price,
                    "biennial_price": p.biennial_price,
                    "setup_fee": p.setup_fee,
                    "currency": p.currency,
                    "hosting_yearly_price": p.hosting_yearly_price,
                    "support_monthly_price": p.support_monthly_price,
                    "features": p.features_list,
                    "is_active": p.is_active,
                    "is_featured": p.is_featured,
                    "savings_yearly": round(p.get_savings_percentage("yearly"), 1)
                }
                for p in packages
            ]
        }
    except Exception as e:
        logger.error(f"Error listing packages: {e}")
        return {"packages": []}


@router.get("/{package_id}")
async def get_package(package_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Get package details."""
    try:
        stmt = select(HostingPackage).where(HostingPackage.id == package_id)
        result = await db.execute(stmt)
        package = result.scalar_one_or_none()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        return {
            "id": package.id,
            "name": package.name,
            "slug": package.slug,
            "description": package.description,
            "disk_space_gb": package.disk_space_gb,
            "bandwidth_gb": package.bandwidth_gb,
            "domains_limit": package.domains_limit,
            "subdomains_limit": package.subdomains_limit,
            "databases_limit": package.databases_limit,
            "email_accounts_limit": package.email_accounts_limit,
            "ftp_accounts_limit": package.ftp_accounts_limit,
            "php_workers": package.php_workers,
            "ram_mb": package.ram_mb,
            "cpu_cores": package.cpu_cores,
            "monthly_price": package.monthly_price,
            "quarterly_price": package.quarterly_price,
            "yearly_price": package.yearly_price,
            "biennial_price": package.biennial_price,
            "setup_fee": package.setup_fee,
            "currency": package.currency,
            "hosting_yearly_price": package.hosting_yearly_price,
            "support_monthly_price": package.support_monthly_price,
            "features": package.features_list,
            "is_active": package.is_active,
            "is_featured": package.is_featured,
            "pricing_comparison": {
                "monthly_equivalent": {
                    "monthly": package.get_monthly_equivalent("monthly"),
                    "quarterly": round(package.get_monthly_equivalent("quarterly"), 2),
                    "yearly": round(package.get_monthly_equivalent("yearly"), 2),
                    "biennial": round(package.get_monthly_equivalent("biennial"), 2)
                },
                "savings_percentage": {
                    "quarterly": round(package.get_savings_percentage("quarterly"), 1),
                    "yearly": round(package.get_savings_percentage("yearly"), 1),
                    "biennial": round(package.get_savings_percentage("biennial"), 1)
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting package {package_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_package(data: PackageCreate, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Create a new hosting package."""
    try:
        # Check for duplicate slug
        stmt = select(HostingPackage).where(HostingPackage.slug == data.slug)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Package with this slug already exists")
        
        package = HostingPackage(
            name=data.name,
            slug=data.slug.lower(),
            description=data.description,
            disk_space_gb=data.disk_space_gb,
            bandwidth_gb=data.bandwidth_gb,
            domains_limit=data.domains_limit,
            databases_limit=data.databases_limit,
            email_accounts_limit=data.email_accounts_limit,
            monthly_price=data.monthly_price,
            quarterly_price=data.quarterly_price,
            yearly_price=data.yearly_price,
            biennial_price=data.biennial_price,
            setup_fee=data.setup_fee,
            currency=data.currency,
            hosting_yearly_price=data.hosting_yearly_price,
            support_monthly_price=data.support_monthly_price,
            is_featured=data.is_featured,
            is_active=True
        )
        
        if data.features:
            package.features_list = data.features
        
        db.add(package)
        await db.commit()
        await db.refresh(package)
        
        return {
            "status": "success",
            "message": f"Package {package.name} created",
            "package_id": package.id
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating package: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{package_id}")
async def update_package(
    package_id: int,
    updates: PackageUpdate,
    db: Annotated[AsyncSession, Depends(get_db)] = None
):
    """Update hosting package."""
    try:
        stmt = select(HostingPackage).where(HostingPackage.id == package_id)
        result = await db.execute(stmt)
        package = result.scalar_one_or_none()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        
        # Handle features specially
        if "features" in update_data:
            package.features_list = update_data.pop("features")
        
        for field, value in update_data.items():
            setattr(package, field, value)
        
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Package {package.name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating package {package_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{package_id}")
async def deactivate_package(package_id: int, db: Annotated[AsyncSession, Depends(get_db)] = None):
    """Deactivate a hosting package (soft delete)."""
    try:
        stmt = select(HostingPackage).where(HostingPackage.id == package_id)
        result = await db.execute(stmt)
        package = result.scalar_one_or_none()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        package.is_active = False
        await db.commit()
        
        return {
            "status": "success",
            "message": f"Package {package.name} deactivated"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deactivating package {package_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
