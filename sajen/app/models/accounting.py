from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, Numeric, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base
from app.models.user import User  # noqa: F401
import enum
from datetime import date


class AccountType(str, enum.Enum):
    ASSET = "asset"           # Harta (Kas, Piutang, Persediaan)
    LIABILITY = "liability"   # Kewajiban (Hutang)
    EQUITY = "equity"         # Modal
    REVENUE = "revenue"       # Pendapatan (Penjualan)
    EXPENSE = "expense"       # Beban (Operasional, HPP)

class Account(Base):
    """
    Chart of Accounts (COA) - Standard SAK EMKM / PSAK UMKM
    Supports multi-tenancy.
    """
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True) # NULLable temporarily for migration, will make NOT NULL
    code = Column(String(20), index=True, nullable=False)              # e.g., "1-1000" (removed global unique)
    name = Column(String(100), nullable=False)                         # e.g., "Kas Utama"
    account_type = Column(Enum(AccountType), nullable=False)
    is_active = Column(Boolean, default=True)
    parent_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)

    parent = relationship("Account", remote_side=[id], backref="sub_accounts")
    tenant = relationship("Tenant")
    journal_entries = relationship("JournalEntry", back_populates="account")

    # Prevent duplicate account codes within the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_account_tenant_code"),
    )


class TransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    SALES = "sales"
    EXPENSE = "expense"
    MANUAL = "manual"
    INCOME = "income"
    OPERATIONAL = "operational"
    NON_CASH_OUT = "non_cash_out"
    NON_CASH_IN = "non_cash_in"
    CAPITAL = "capital"

class TransactionStatus(str, enum.Enum):
    DRAFT = "draft"
    POSTED = "posted"

class Transaction(Base):
    """
    Transaction Header - Multi-Tenant isolated
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    transaction_date = Column(Date, default=date.today, nullable=False, index=True)
    reference_no = Column(String(50), index=True, nullable=True) # Removed global unique for multi-tenant isolation
    description = Column(Text, nullable=False)
    transaction_type = Column(Enum(TransactionType), default=TransactionType.MANUAL, nullable=False)
    status = Column(Enum(TransactionStatus), default=TransactionStatus.DRAFT, nullable=False, index=True)
    
    # Store the net total of the transaction for quick reference
    total_amount = Column(Numeric(15, 2), default=0.00, nullable=False)
    
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    creator = relationship("User")
    tenant = relationship("Tenant")

    entries = relationship("JournalEntry", back_populates="transaction", cascade="all, delete-orphan")
    inventory_logs = relationship("InventoryLog", back_populates="transaction", cascade="all, delete-orphan")

    # Prevent duplicate reference numbers for the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "reference_no", name="uq_transaction_tenant_ref"),
    )


class JournalEntry(Base):
    """
    Double-Entry Lines (Debit/Credit)
    """
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    
    # Using Numeric to prevent floating point inaccuracies
    debit = Column(Numeric(15, 2), default=0.00, nullable=False)
    credit = Column(Numeric(15, 2), default=0.00, nullable=False)

    transaction = relationship("Transaction", back_populates="entries")
    account = relationship("Account", back_populates="journal_entries")
