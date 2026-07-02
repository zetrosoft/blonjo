from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import Optional

from app.models.inventory import Product, TenantInventory, InventoryLog
from app.models.setting import AppSetting

class InventoryService:
    """
    Handles stock levels and inventory-specific business logic.
    Supports 'Stock Maintenance' (Static vs Dynamic stock).
    """

    @staticmethod
    def get_stock_level(db: Session, tenant_id: int, product_id: int) -> Decimal:
        """
        Gets current stock level for a product.
        Checks if Stock Maintenance is ON for the tenant.
        """
        # 1. Check Setting
        setting = db.query(AppSetting).filter(
            AppSetting.tenant_id == tenant_id, 
            AppSetting.key == "stock_maintenance"
        ).first()
        
        is_static = setting.value.lower() == "true" if setting else False

        if is_static:
            # Read from static column in TenantInventory
            ti = db.query(TenantInventory).filter(
                TenantInventory.tenant_id == tenant_id,
                TenantInventory.product_id == product_id
            ).first()
            return ti.static_stock if ti else Decimal('0.00')
        else:
            # Calculate Dynamically (Perpetual)
            # Stock = Sum(Logs IN) - Sum(Logs OUT)
            # Note: We need to filter logs belonging to the tenant's transactions
            from app.models.accounting import Transaction
            
            in_qty = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                InventoryLog.product_id == product_id,
                InventoryLog.log_type == "in"
            ).scalar() or Decimal('0.00')

            out_qty = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                InventoryLog.product_id == product_id,
                InventoryLog.log_type == "out"
            ).scalar() or Decimal('0.00')

            return (in_qty - out_qty).quantize(Decimal('0.00'))

    @staticmethod
    def update_stock_after_transaction(
        db: Session, 
        tenant_id: int, 
        product_id: int, 
        qty_change: Decimal, 
        log_type: str
    ):
        """
        Updates static stock if Maintenance is ON.
        qty_change is always positive; logic uses log_type.
        """
        setting = db.query(AppSetting).filter(
            AppSetting.tenant_id == tenant_id, 
            AppSetting.key == "stock_maintenance"
        ).first()
        
        if setting and setting.value.lower() == "true":
            ti = db.query(TenantInventory).filter(
                TenantInventory.tenant_id == tenant_id,
                TenantInventory.product_id == product_id
            ).first()
            
            if not ti:
                ti = TenantInventory(tenant_id=tenant_id, product_id=product_id, static_stock=Decimal('0.00'))
                db.add(ti)
                db.flush()
            
            current_stock_dec = Decimal(str(ti.static_stock or 0.0))
            if log_type == "in":
                ti.static_stock = current_stock_dec + qty_change
            else:
                ti.static_stock = current_stock_dec - qty_change
            
            db.add(ti)
