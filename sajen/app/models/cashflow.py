"""
CashflowProjectionSnapshot — menyimpan snapshot proyeksi harian dan mengisi
aktual dari transaksi yang sudah POSTED, agar bisa diukur akurasi AI forecasting.
"""
from sqlalchemy import (
    Column, Integer, String, Date, Numeric,
    ForeignKey, UniqueConstraint, DateTime, func
)
from app.models.base import Base


class CashflowProjectionSnapshot(Base):
    """
    Satu baris = satu hari proyeksi untuk satu tenant.
    projected_* diisi saat generate_cashflow_projection dipanggil.
    actual_*    diisi lazy saat endpoint /accuracy dipanggil
                (baca dari Transaction POSTED di target_date).
    """
    __tablename__ = "cashflow_projection_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "projection_date", "target_date",
            name="uq_cashflow_snapshot"
        ),
    )

    id              = Column(Integer, primary_key=True, index=True)
    tenant_id       = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # Tanggal saat proyeksi ini di-generate
    projection_date = Column(Date, nullable=False)

    # Hari yang diproyeksikan (target_date dalam 30 hari ke depan)
    target_date     = Column(Date, nullable=False, index=True)

    # Proyeksi (dari AI / algoritma)
    projected_inflow  = Column(Numeric(18, 2), default=0)
    projected_outflow = Column(Numeric(18, 2), default=0)
    projected_net     = Column(Numeric(18, 2), default=0)

    # Aktual (diisi dari transaksi POSTED)
    actual_inflow     = Column(Numeric(18, 2), nullable=True)
    actual_outflow    = Column(Numeric(18, 2), nullable=True)
    actual_net        = Column(Numeric(18, 2), nullable=True)

    # Catatan proyeksi (label outflow, dll)
    note              = Column(String(255), nullable=True)

    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), onupdate=func.now())
