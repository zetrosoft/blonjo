from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, Numeric, Date, Text
from sqlalchemy.orm import relationship
from app.models.base import Base
from app.models.user import User  # Crucial for resolving relationship("User")
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
    Chart of Accounts (COA) - Standard PSAK UMKM
    """
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False) # e.g., "1-100"
    name = Column(String(100), nullable=False)                         # e.g., "Kas Utama"
    account_type = Column(Enum(AccountType), nullable=False)
    is_active = Column(Boolean, default=True)
    parent_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)

    parent = relationship("Account", remote_side=[id], backref="sub_accounts")
    journal_entries = relationship("JournalEntry", back_populates="account")


class TransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    SALES = "sales"
    EXPENSE = "expense"
    MANUAL = "manual"

class Transaction(Base):
    """
    Transaction Header
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_date = Column(Date, default=date.today, nullable=False, index=True)
    reference_no = Column(String(50), unique=True, index=True, nullable=True) # e.g., "INV-2023-001"
    description = Column(Text, nullable=False)
    transaction_type = Column(Enum(TransactionType), default=TransactionType.MANUAL, nullable=False)
    
    # Store the net total of the transaction for quick reference
    total_amount = Column(Numeric(15, 2), default=0.00, nullable=False)
    
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    creator = relationship("User")

    entries = relationship("JournalEntry", back_populates="transaction", cascade="all, delete-orphan")


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
