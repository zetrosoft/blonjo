import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def compute_image_signature(image_bytes: bytes) -> str:
    """
    Computes a 64-bit Perceptual Hash (dHash) for an image.
    Resilient to scaling, rotation, brightness, and resolution differences.
    """
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return ""
        
        # Resize to 9x8 for Difference Hashing (dHash)
        resized = cv2.resize(img, (9, 8), interpolation=cv2.INTER_AREA)
        # Compute difference between adjacent pixels (8x8 = 64 bits)
        diff = resized[:, 1:] > resized[:, :-1]
        bits = diff.flatten().astype(int)
        
        # Convert 64 bits to 16-character hex string
        bit_str = "".join(str(b) for b in bits)
        return f"{int(bit_str, 2):016x}"
    except Exception as e:
        logger.error(f"Error computing image signature: {e}")
        return ""

def hamming_distance(hash1: str, hash2: str) -> int:
    """
    Computes Hamming Distance between two 64-bit hex hash strings.
    0 = Identical image
    <= 10 = Very high visual similarity (>= 85% match)
    > 15 = Different image
    """
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 999
    try:
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        xor_val = val1 ^ val2
        return bin(xor_val).count('1')
    except Exception:
        return 999

def match_and_crop(image_bytes: bytes, template_coords: dict = None) -> tuple[bytes, bool]:
    """
    Membandingkan gambar baru dengan koordinat template (jika ada).
    Jika cocok, potong (crop) gambar sesuai koordinat bounding box yang diberikan.
    
    Returns:
        (cropped_image_bytes, is_cropped: bool)
    """
    if not template_coords:
        return image_bytes, False

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return image_bytes, False

        # TODO: Implementasikan pencocokan ORB/SIFT di sini jika ingin auto-align (perspective transform).
        # Saat ini kita lakukan crop sederhana sesuai bounding box untuk POC (Proof of Concept).
        
        x = template_coords.get("x", 0)
        y = template_coords.get("y", 0)
        w = template_coords.get("w", 0)
        h = template_coords.get("h", 0)

        # Validasi koordinat
        height, width = img.shape[:2]
        if w > 0 and h > 0 and x + w <= width and y + h <= height:
            cropped = img[y:y+h, x:x+w]
            
            # Encode kembali ke bytes
            success, buffer = cv2.imencode('.jpg', cropped)
            if success:
                return buffer.tobytes(), True

        return image_bytes, False
    except Exception as e:
        logger.error(f"Error in match_and_crop: {e}")
        # FALLBACK AMAN: Jika OpenCV gagal/error, selalu kembalikan gambar asli utuh.
        return image_bytes, False

def detect_receipt_bounding_box(image_bytes: bytes) -> dict:
    """
    Mendeteksi area nota/tabel secara dinamis menggunakan OpenCV (Edge/Contour Detection).
    Mengembalikan koordinat {x, y, w, h}.
    """
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"x": 0, "y": 0, "w": 0, "h": 0}
            
        # Preprocessing: Blur & Edge detection
        blurred = cv2.GaussianBlur(img, (5, 5), 0)
        edged = cv2.Canny(blurred, 50, 150)
        
        # Dilate to connect text and edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5,5))
        dilated = cv2.dilate(edged, kernel, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return {"x": 0, "y": 0, "w": 0, "h": 0}
            
        # Cari bounding box yang menutupi semua kontur utama
        x_min, y_min = img.shape[1], img.shape[0]
        x_max, y_max = 0, 0
        
        valid_contours = 0
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            # Filter kontur noise
            if w > 20 and h > 20:
                x_min = min(x_min, x)
                y_min = min(y_min, y)
                x_max = max(x_max, x + w)
                y_max = max(y_max, y + h)
                valid_contours += 1
                
        if valid_contours == 0:
            return {"x": 0, "y": 0, "w": 0, "h": 0}
            
        # Tambahkan padding 15px
        padding = 15
        x_min = max(0, x_min - padding)
        y_min = max(0, y_min - padding)
        x_max = min(img.shape[1], x_max + padding)
        y_max = min(img.shape[0], y_max + padding)
        
        return {
            "x": int(x_min),
            "y": int(y_min),
            "w": int(x_max - x_min),
            "h": int(y_max - y_min)
        }
    except Exception as e:
        logger.error(f"Error detecting bounding box: {e}")
        return {"x": 0, "y": 0, "w": 0, "h": 0}
