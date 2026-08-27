import logging
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.inventory import Product
from app.services.onnx_embed import get_onnx_embedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("update_embeddings")

def update_all_embeddings():
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        total = len(products)
        logger.info(f"Found {total} products in database.")
        
        updated_count = 0
        for idx, product in enumerate(products, 1):
            if not product.name:
                continue
            
            logger.info(f"[{idx}/{total}] Processing product: {product.name} ({product.sku})")
            try:
                # Generate local ONNX embedding
                embedding = get_onnx_embedding(product.name, is_query=False)
                product.embedding = embedding
                updated_count += 1
            except Exception as e:
                logger.error(f"Failed to generate embedding for {product.name}: {e}")
            
            # Commit in batches of 50
            if idx % 50 == 0:
                db.commit()
                logger.info(f"Batched commit at {idx} products.")
                
        db.commit()
        logger.info(f"Successfully updated embeddings for {updated_count}/{total} products.")
    except Exception as e:
        logger.error(f"Error occurred during script execution: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_all_embeddings()
