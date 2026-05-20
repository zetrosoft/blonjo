from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.core.security import get_password_hash

def seed_admin():
    db = SessionLocal()
    admin_email = "admin@blonjo.com"
    
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    if not existing_admin:
        new_admin = User(
            email=admin_email,
            hashed_password=get_password_hash("blonjo123!"),
            full_name="Super Admin Blonjo",
            role=UserRole.ADMIN,
            is_active=True,
            preferred_language="ID"
        )
        db.add(new_admin)
        db.commit()
        print("Admin user seeded successfully!")
    else:
        print("Admin user already exists.")
        
    db.close()

if __name__ == "__main__":
    seed_admin()
