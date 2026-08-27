import os
import urllib.request
from pathlib import Path

def download_file(url: str, dest_path: Path):
    if dest_path.exists():
        print(f"File {dest_path.name} already exists. Skipping download.")
        return

    print(f"Downloading {url} to {dest_path}...")
    try:
        # Create directories if they do not exist
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Download the file
        urllib.request.urlretrieve(url, dest_path)
        print(f"Successfully downloaded {dest_path.name}.")
    except Exception as e:
        print(f"Failed to download {dest_path.name} from {url}: {e}")
        raise e

def main():
    # Define directories
    base_dir = Path(__file__).resolve().parent.parent
    model_dir = base_dir / "resources" / "models"
    
    # Model URLs (using Xenova's pre-converted quantized ONNX model for high efficiency and smaller size ~110MB/55MB)
    model_url = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx"
    tokenizer_url = "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/tokenizer.json"
    
    # Destination paths
    model_dest = model_dir / "model.onnx"
    tokenizer_dest = model_dir / "tokenizer.json"
    
    # Download files
    download_file(model_url, model_dest)
    download_file(tokenizer_url, tokenizer_dest)
    print("Model download workflow finished successfully.")

if __name__ == "__main__":
    main()
