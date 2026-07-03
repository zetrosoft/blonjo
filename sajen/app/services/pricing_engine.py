from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from decimal import Decimal
from typing import Optional
from datetime import date

from app.models.inventory import (
    Product, TenantInventory, TenantProductPrice, TenantPricingRule, 
    InventoryLog, ProductUnitConversion
)
from app.models.setting import AppSetting

class PricingEngine:
    """
    Core Logic for calculating Product Prices and HPP based on hierarchical rules.
    1. PricingRule (AI-parsed JSON)
    2. TenantProductPrice (Value or Margin)
    3. Moving Average / Last Price Fallback
    """

    @staticmethod
    def get_product_price(
        db: Session, 
        tenant_id: int, 
        product_id: int, 
        quantity: Decimal = Decimal('1.00'),
        unit: Optional[str] = None
    ) -> Decimal:
        """
        Calculates the selling price for a specific product and quantity.
        Supports:
        - 'tiered': multi-level prices based on quantity thresholds & unit
        - 'bundle_multiple': multi-buy packages (e.g., buy 1 = 4500, buy 2 = 8000)
        - 'volume': simple quantity thresholds
        - 'formula': multipliers
        """
        today = date.today()

        # --- 1. Check Pricing Rule (Highest Priority) ---
        product = db.query(Product).get(product_id)
        
        rules = db.query(TenantPricingRule).filter(
            TenantPricingRule.tenant_id == tenant_id,
            TenantPricingRule.is_active == True,
            TenantPricingRule.valid_from <= today,
            or_(TenantPricingRule.valid_to == None, TenantPricingRule.valid_to >= today)
        ).filter(
            or_(
                TenantPricingRule.product_id == product_id,
                TenantPricingRule.product_id == None
            )
        ).all()

        rule = None
        # Priority 1: Exact product match
        for r in rules:
            if r.product_id == product_id:
                rule = r
                break
        
        # Priority 2: Keyword match for 'all variants'
        if not rule and product:
            for r in rules:
                if r.product_id is None and r.rule_payload:
                    keyword = r.rule_payload.get('apply_to_keyword')
                    if keyword and keyword.lower() in product.name.lower():
                        rule = r
                        break

        if rule:
            payload = rule.rule_payload
            
            # --- Tipe A: Tiered / Multi-level Pricing ---
            if rule.rule_type == 'tiered' and 'tiers' in payload:
                tiers = payload['tiers']
                matched_tiers = []
                if unit:
                    matched_tiers = [t for t in tiers if t.get('unit') and t.get('unit').lower() == unit.lower()]
                
                if not matched_tiers:
                    matched_tiers = tiers
                
                # Sort by qty_threshold descending to find the largest matching threshold
                matched_tiers = sorted(matched_tiers, key=lambda x: float(x.get('qty_threshold', 0)), reverse=True)
                
                for tier in matched_tiers:
                    threshold = Decimal(str(tier.get('qty_threshold', 0)))
                    if quantity >= threshold:
                        return Decimal(str(tier.get('unit_price')))

            # --- Tipe B: Bundle / Multi-buy kelipatan ---
            if rule.rule_type == 'bundle_multiple' and 'bundle_rules' in payload:
                br = payload['bundle_rules']
                bundle_qty = Decimal(str(br.get('bundle_qty', 1)))
                bundle_price = Decimal(str(br.get('bundle_price', 0)))
                base_price = Decimal(str(br.get('base_price', 0)))
                
                if quantity >= bundle_qty:
                    bundles = quantity // bundle_qty
                    remainder = quantity % bundle_qty
                    total_price = (bundles * bundle_price) + (remainder * base_price)
                    return (total_price / quantity).quantize(Decimal('0.00'))
                else:
                    return base_price

            # --- Tipe C: Volume (Legacy) ---
            if rule.rule_type == 'volume':
                threshold = Decimal(str(payload.get('qty_threshold', 1)))
                if quantity >= threshold:
                    return Decimal(str(payload.get('price_per_qty')))
            
            # --- Tipe D: Formula ---
            if rule.rule_type == 'formula' and 'multiplier' in payload:
                base_price = PricingEngine._get_base_price(db, tenant_id, product_id)
                return (base_price * Decimal(str(payload['multiplier']))).quantize(Decimal('0.00'))

            # --- Tipe E: Discount Percent ---
            if rule.rule_type == 'discount' and 'discount_percent' in payload:
                base_price = PricingEngine._get_base_price(db, tenant_id, product_id)
                discount_pct = Decimal(str(payload['discount_percent']))
                return (base_price * (1 - discount_pct / 100)).quantize(Decimal('0.00'))

        # --- 2. Check Basic Tenant Price ---
        return PricingEngine._get_base_price(db, tenant_id, product_id)

    @staticmethod
    def _get_base_price(db: Session, tenant_id: int, product_id: int) -> Decimal:
        """Helper to get price from TenantProductPrice or Fallback"""
        t_price = db.query(TenantProductPrice).filter(
            TenantProductPrice.tenant_id == tenant_id,
            TenantProductPrice.product_id == product_id
        ).first()

        if t_price:
            if t_price.pricing_method == 'value':
                return t_price.amount
            elif t_price.pricing_method == 'margin':
                hpp = PricingEngine.get_current_hpp(db, tenant_id, product_id)
                return (hpp * (1 + t_price.amount / 100)).quantize(Decimal('0.00'))

        # --- 3. Fallback: HPP + Default Margin ---
        hpp = PricingEngine.get_current_hpp(db, tenant_id, product_id)
        # Get default margin from settings
        margin_setting = db.query(AppSetting).filter(
            AppSetting.tenant_id == tenant_id, 
            AppSetting.key == "default_sales_margin"
        ).first()
        margin = Decimal(margin_setting.value) / 100 if margin_setting else Decimal('0.20') # 20% default
        
        return (hpp * (1 + margin)).quantize(Decimal('0.00'))

    @staticmethod
    def get_current_hpp(db: Session, tenant_id: int, product_id: int) -> Decimal:
        """
        Gets current HPP based on Moving Average.
        Falls back to Last Purchase Price.
        """
        ti = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.product_id == product_id
        ).first()

        if ti:
            if ti.moving_average_cost > 0:
                return ti.moving_average_cost
            if ti.last_purchase_price > 0:
                return ti.last_purchase_price

        # Extreme Fallback: Last Purchase in logs
        last_log = db.query(InventoryLog).filter(
            InventoryLog.product_id == product_id,
            InventoryLog.log_type == "in"
        ).order_by(InventoryLog.id.desc()).first()

        return last_log.price_per_unit if last_log else Decimal('0.00')

    @staticmethod
    def update_moving_average(
        db: Session, 
        tenant_id: int, 
        product_id: int, 
        new_qty: Decimal, 
        new_price: Decimal
    ):
        """
        Updates Moving Average Cost after a new purchase.
        Formula: ((Old Qty * Old HPP) + (New Qty * New Price)) / (Old Qty + New Qty)
        """
        ti = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.product_id == product_id
        ).first()

        if not ti:
            # Create if not exists
            ti = TenantInventory(tenant_id=tenant_id, product_id=product_id)
            db.add(ti)
            db.flush()

        # Get current stock
        from app.services.inventory import InventoryService
        current_stock = InventoryService.get_stock_level(db, tenant_id, product_id)
        current_stock_dec = Decimal(str(current_stock))
        
        old_hpp = ti.moving_average_cost or new_price
        
        if current_stock_dec + new_qty > 0:
            new_hpp = ((current_stock_dec * old_hpp) + (new_qty * new_price)) / (current_stock_dec + new_qty)
            ti.moving_average_cost = new_hpp.quantize(Decimal('0.00'))
        else:
            ti.moving_average_cost = new_price # Fallback if division by zero possible
        
        ti.last_purchase_price = new_price
        db.add(ti)
        
        # Get current selling price and auto-adjust if margin falls below threshold
        from app.models.inventory import TenantProductPrice
        t_price = db.query(TenantProductPrice).filter(
            TenantProductPrice.tenant_id == tenant_id,
            TenantProductPrice.product_id == product_id
        ).first()
        
        if t_price and t_price.amount > 0 and old_hpp > 0:
            prev_margin = (t_price.amount - old_hpp) / old_hpp
            
            from app.models.setting import AppSetting
            margin_setting = db.query(AppSetting).filter(
                AppSetting.tenant_id == tenant_id,
                AppSetting.key == "default_sales_margin"
            ).first()
            default_margin = Decimal(margin_setting.value) / 100 if margin_setting else Decimal('0.20')
            
            new_hpp_cost = ti.moving_average_cost
            if new_hpp_cost > 0:
                current_margin = (t_price.amount - new_hpp_cost) / new_hpp_cost
                if current_margin < default_margin:
                    # Target margin is the max of default margin or historical margin
                    target_margin = max(default_margin, prev_margin)
                    new_price_val = new_hpp_cost * (1 + target_margin)
                    t_price.amount = new_price_val.quantize(Decimal('0.00'))
                    t_price.auto_adjusted = True
                    db.add(t_price)
