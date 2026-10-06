from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter()

class OrderNotificationWebhook(BaseModel):
    tenant_id: Optional[str] = "1"
    customer_name: Optional[str] = "Customer"
    customer_phone: Optional[str] = ""
    order_content: str
    order_summary: Optional[str] = "Item Pesanan"
    source: Optional[str] = "whatsapp"

class NotificationResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    title: str
    message: str
    customer_name: Optional[str]
    customer_phone: Optional[str]
    order_summary: Optional[str]
    source: str
    is_read: bool
    created_at: datetime

    class Config:
        orm_mode = True

@router.post("/orders", status_code=201)
def receive_order_notification(
    payload: OrderNotificationWebhook,
    db: Session = Depends(get_db)
):
    """
    Webhook Endpoint untuk menerima notifikasi pesanan masuk dari BiZETO WhatsApp.
    """
    try:
        t_id = int(payload.tenant_id) if payload.tenant_id and str(payload.tenant_id).isdigit() else 1
    except:
        t_id = 1

    title = f"Pesanan Baru WA: {payload.customer_name or 'Customer'}"
    if payload.customer_phone:
        title += f" ({payload.customer_phone})"

    notif = Notification(
        tenant_id=t_id,
        title=title,
        message=payload.order_content,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        order_summary=payload.order_summary,
        source=payload.source or "whatsapp",
        is_read=False
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    return {
        "status": "success",
        "notification_id": notif.id,
        "message": "Notification received and stored."
    }

@router.get("", response_model=List[NotificationResponse])
def get_notifications(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Mengambil daftar notifikasi terbaru untuk tenant pengguna yang sedang login.
    """
    query = db.query(Notification)
    if current_user.tenant_id:
        query = query.filter((Notification.tenant_id == current_user.tenant_id) | (Notification.tenant_id == None))
    
    notifications = query.order_by(desc(Notification.created_at)).limit(limit).all()
    return notifications

@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Mengambil jumlah notifikasi belum dibaca.
    """
    query = db.query(func.count(Notification.id)).filter(Notification.is_read == False)
    if current_user.tenant_id:
        query = query.filter((Notification.tenant_id == current_user.tenant_id) | (Notification.tenant_id == None))
    
    count = query.scalar() or 0
    return {"unread_count": count}

@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Menandai notifikasi spesifik sebagai sudah dibaca.
    """
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notif.is_read = True
    db.commit()
    return {"status": "success", "id": notification_id, "is_read": True}

@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Menandai semua notifikasi tenant sebagai sudah dibaca.
    """
    query = db.query(Notification).filter(Notification.is_read == False)
    if current_user.tenant_id:
        query = query.filter((Notification.tenant_id == current_user.tenant_id) | (Notification.tenant_id == None))
    
    query.update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}
