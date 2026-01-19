"""
Hosting Package API routes.

Manages hosting package definitions with pricing tiers.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
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
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


@router.get("/")
async def list_packages(
    is_active: bool = True,
    db: Session = Depends(get_db)
):
    """List all hosting packages."""
    try:
        query = db.query(HostingPackage)
        
        if is_active is not None:
            query = query.filter(HostingPackage.is_active == is_active)
        
        packages = query.order_by(HostingPackage.sort_order, HostingPackage.yearly_price).all()
        
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
                    "features": p.features_list,
                    "is_active": p.is_active,
                    "is_featured": p.is_featured,
                    "savings_yearly": round(p.get_savings_percentage("yearly"), 1)
                }
                for p in packages
            ]
        }
    except Exception as e:
        logger.warning(f"Error listing packages (returning empty): {e}")
        return {"packages": []}


@router.get("/{package_id}")
async def get_package(package_id: int, db: Session = Depends(get_db)):
    """Get package details."""
    try:
        package = db.query(HostingPackage).filter(HostingPackage.id == package_id).first()
        
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
async def create_package(data: PackageCreate, db: Session = Depends(get_db)):
    """Create a new hosting package."""
    try:
        # Check for duplicate slug
        existing = db.query(HostingPackage).filter(HostingPackage.slug == data.slug).first()
        if existing:
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
            is_featured=data.is_featured,
            is_active=True
        )
        
        if data.features:
            package.features_list = data.features
        
        db.add(package)
        db.commit()
        db.refresh(package)
        
        return {
            "status": "success",
            "message": f"Package {package.name} created",
            "package_id": package.id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating package: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{package_id}")
async def update_package(
    package_id: int,
    updates: PackageUpdate,
    db: Session = Depends(get_db)
):
    """Update hosting package."""
    try:
        package = db.query(HostingPackage).filter(HostingPackage.id == package_id).first()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        update_data = updates.model_dump(exclude_unset=True)
        
        # Handle features specially
        if "features" in update_data:
            package.features_list = update_data.pop("features")
        
        for field, value in update_data.items():
            setattr(package, field, value)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Package {package.name} updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating package {package_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{package_id}")
async def deactivate_package(package_id: int, db: Session = Depends(get_db)):
    """Deactivate a hosting package (soft delete)."""
    try:
        package = db.query(HostingPackage).filter(HostingPackage.id == package_id).first()
        
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        package.is_active = False
        db.commit()
        
        return {
            "status": "success",
            "message": f"Package {package.name} deactivated"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deactivating package {package_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
