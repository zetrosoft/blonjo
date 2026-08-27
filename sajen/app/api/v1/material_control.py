from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import SessionDep, CurrentUser
from app.models.user import User
from app.models.inventory import PurchasePlan, StockDiscard
from app.schemas.material_control import (
    PurchasePlanCreate, PurchasePlanResponse,
    StockDiscardCreate, StockDiscardResponse,
    CashflowProjectionItem, PurchasePlanExecuteRequest, PurchasePlanUpdate
)
from app.services.material_control import (
    get_replenishment_recommendations,
    list_purchase_plans,
    create_purchase_plan,
    update_purchase_plan,
    approve_purchase_plan,
    delete_purchase_plan,
    record_stock_discard,
    generate_cashflow_projection,
    execute_purchase_plan_items,
    get_projection_accuracy
)

router = APIRouter()

# ─── AUTO-REPLENISHMENT RECOMMENDATION ENDPOINT ────────────────────

@router.get("/recommendations", response_model=List[dict])
def get_mtc_recommendations(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get dynamic reorder recommendations based on ROP levels and safety stock.
    """
    return get_replenishment_recommendations(db=session, tenant_id=current_user.tenant_id)

# ─── PURCHASE PLANNING ENDPOINTS ───────────────────────────────────

@router.get("/purchase-plans", response_model=List[PurchasePlanResponse])
def get_purchase_plans(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Retrieve all purchase planning proposals (drafts, approved, completed).
    """
    plans = list_purchase_plans(db=session, tenant_id=current_user.tenant_id)
    # Map items correctly
    results = []
    for plan in plans:
        items_mapped = []
        for it in plan.items:
            items_mapped.append({
                "id": it.id,
                "purchase_plan_id": it.purchase_plan_id,
                "product_id": it.product_id,
                "custom_product_name": it.custom_product_name,
                "product_name": it.product.name if it.product else it.custom_product_name,
                "sku": it.product.sku if it.product else "N/A",
                "supplier_contact_id": it.supplier_contact_id,
                "supplier_name": it.supplier.name if it.supplier else None,
                "qty": it.qty,
                "unit_price": it.unit_price,
                "subtotal": it.subtotal,
                "is_purchased": it.is_purchased
            })
        results.append({
            "id": plan.id,
            "tenant_id": plan.tenant_id,
            "status": plan.status,
            "send_via_wa": plan.send_via_wa,
            "send_via_email": plan.send_via_email,
            "total_amount": plan.total_amount,
            "planned_date": plan.planned_date,
            "created_at": plan.created_at,
            "items": items_mapped
        })
    return results

@router.post("/purchase-plans", response_model=PurchasePlanResponse, status_code=status.HTTP_201_CREATED)
def create_new_purchase_plan(
    plan_in: PurchasePlanCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Propose a new purchase plan (draft).
    """
    plan = create_purchase_plan(db=session, tenant_id=current_user.tenant_id, plan_in=plan_in)
    
    # Map items response
    items_mapped = []
    for it in plan.items:
        items_mapped.append({
            "id": it.id,
            "purchase_plan_id": it.purchase_plan_id,
            "product_id": it.product_id,
            "custom_product_name": it.custom_product_name,
            "product_name": it.product.name if it.product else it.custom_product_name,
            "sku": it.product.sku if it.product else "N/A",
            "supplier_contact_id": it.supplier_contact_id,
            "supplier_name": it.supplier.name if it.supplier else None,
            "qty": it.qty,
            "unit_price": it.unit_price,
            "subtotal": it.subtotal,
            "is_purchased": it.is_purchased
        })
    return {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "status": plan.status,
        "send_via_wa": plan.send_via_wa,
        "send_via_email": plan.send_via_email,
        "total_amount": plan.total_amount,
        "planned_date": plan.planned_date,
        "created_at": plan.created_at,
        "items": items_mapped
    }

@router.put("/purchase-plans/{plan_id}", response_model=PurchasePlanResponse)
def update_existing_purchase_plan(
    plan_id: int,
    plan_in: PurchasePlanUpdate,
    session: SessionDep,
    current_user: CurrentUser
):
    plan = update_purchase_plan(db=session, tenant_id=current_user.tenant_id, plan_id=plan_id, plan_in=plan_in)
    if not plan:
        raise HTTPException(status_code=404, detail="Purchase plan not found or cannot be edited")

    items_mapped = []
    for it in plan.items:
        items_mapped.append({
            "id": it.id,
            "purchase_plan_id": it.purchase_plan_id,
            "product_id": it.product_id,
            "custom_product_name": it.custom_product_name,
            "product_name": it.product.name if it.product else it.custom_product_name,
            "sku": it.product.sku if it.product else "N/A",
            "supplier_contact_id": it.supplier_contact_id,
            "supplier_name": it.supplier.name if it.supplier else None,
            "qty": it.qty,
            "unit_price": it.unit_price,
            "subtotal": it.subtotal,
            "is_purchased": it.is_purchased
        })
    return {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "status": plan.status,
        "send_via_wa": plan.send_via_wa,
        "send_via_email": plan.send_via_email,
        "total_amount": plan.total_amount,
        "planned_date": plan.planned_date,
        "created_at": plan.created_at,
        "items": items_mapped
    }

@router.post("/purchase-plans/{plan_id}/approve", response_model=PurchasePlanResponse)
def approve_pending_purchase_plan(
    plan_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Approve purchase plan, trigger PO notifications, and post adjusting PSAK double-entry journals.
    """
    plan = approve_purchase_plan(db=session, tenant_id=current_user.tenant_id, plan_id=plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Purchase plan proposal not found")
        
    items_mapped = []
    for it in plan.items:
        items_mapped.append({
            "id": it.id,
            "purchase_plan_id": it.purchase_plan_id,
            "product_id": it.product_id,
            "custom_product_name": it.custom_product_name,
            "product_name": it.product.name if it.product else it.custom_product_name,
            "sku": it.product.sku if it.product else "N/A",
            "supplier_contact_id": it.supplier_contact_id,
            "supplier_name": it.supplier.name if it.supplier else None,
            "qty": it.qty,
            "unit_price": it.unit_price,
            "subtotal": it.subtotal,
            "is_purchased": it.is_purchased
        })

    return {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "status": plan.status,
        "send_via_wa": plan.send_via_wa,
        "send_via_email": plan.send_via_email,
        "total_amount": plan.total_amount,
        "planned_date": plan.planned_date,
        "created_at": plan.created_at,
        "items": items_mapped
    }


@router.post("/purchase-plans/{plan_id}/execute", response_model=PurchasePlanResponse)
def execute_pending_purchase_plan(
    plan_id: int,
    req_body: PurchasePlanExecuteRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Mark specific items inside a purchase plan as purchased.
    Optionally transition the plan status to COMPLETED.
    """
    plan = execute_purchase_plan_items(
        db=session, 
        tenant_id=current_user.tenant_id, 
        plan_id=plan_id,
        purchased_item_ids=req_body.purchased_item_ids,
        complete_plan=req_body.complete_plan
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Purchase plan not found")

    items_mapped = []
    for it in plan.items:
        items_mapped.append({
            "id": it.id,
            "purchase_plan_id": it.purchase_plan_id,
            "product_id": it.product_id,
            "custom_product_name": it.custom_product_name,
            "product_name": it.product.name if it.product else it.custom_product_name,
            "sku": it.product.sku if it.product else "N/A",
            "supplier_contact_id": it.supplier_contact_id,
            "supplier_name": it.supplier.name if it.supplier else None,
            "qty": it.qty,
            "unit_price": it.unit_price,
            "subtotal": it.subtotal,
            "is_purchased": it.is_purchased
        })

    return {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "status": plan.status,
        "send_via_wa": plan.send_via_wa,
        "send_via_email": plan.send_via_email,
        "total_amount": plan.total_amount,
        "planned_date": plan.planned_date,
        "created_at": plan.created_at,
        "items": items_mapped
    }


@router.delete("/purchase-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_purchase_plan(
    plan_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Delete a purchase plan proposal.
    """
    success = delete_purchase_plan(db=session, tenant_id=current_user.tenant_id, plan_id=plan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Purchase plan not found")
    return


# ─── STOCK DISCARD ENDPOINTS (WASTE TRACKING) ─────────────────────

@router.post("/stock-discards", response_model=StockDiscardResponse, status_code=status.HTTP_201_CREATED)
def record_discarded_materials(
    discard_in: StockDiscardCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Record expired/damaged stock, deduct physical inventory, and post waste adjusting journals.
    """
    discard = record_stock_discard(db=session, tenant_id=current_user.tenant_id, discard_in=discard_in)
    return {
        "id": discard.id,
        "tenant_id": discard.tenant_id,
        "product_id": discard.product_id,
        "product_name": discard.product.name,
        "sku": discard.product.sku,
        "qty": discard.qty,
        "reason": discard.reason,
        "created_at": discard.created_at
    }

# ─── BUDGETING & CASHFLOW PROJECTION ENDPOINT ─────────────────────

@router.get("/cashflow-projection", response_model=List[CashflowProjectionItem])
def get_cashflow_projection(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Fetch a linear 30-day daily cashflow projection based on average sales, ROP plans, and debt due dates.
    Saves snapshot automatically for later accuracy comparison.
    """
    return generate_cashflow_projection(db=session, tenant_id=current_user.tenant_id)


@router.get("/cashflow-projection/accuracy", response_model=List[dict])
def get_cashflow_accuracy(
    session: SessionDep,
    current_user: CurrentUser,
    days: int = Query(default=30, ge=1, le=90, description="Jumlah hari ke belakang untuk dievaluasi")
):
    """
    Compare projected vs actual cashflow for past days.
    Actual values are lazily filled from POSTED transactions.
    Returns accuracy percentage per day.
    """
    return get_projection_accuracy(db=session, tenant_id=current_user.tenant_id, days=days)
