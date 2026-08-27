import os
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from pathlib import Path

class ONNXEmbeddingEngine:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ONNXEmbeddingEngine, cls).__new__(cls, *args, **kwargs)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return
        
        base_dir = Path(__file__).resolve().parent.parent
        model_path = base_dir / "resources" / "models" / "model.onnx"
        tokenizer_path = base_dir / "resources" / "models" / "tokenizer.json"
        
        if not model_path.exists() or not tokenizer_path.exists():
            raise FileNotFoundError("ONNX Model or Tokenizer file not found. Run download script first.")

        # Load Tokenizer
        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        
        # Load ONNX Session with CPU optimizations
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 2
        
        self.session = ort.InferenceSession(str(model_path), sess_options=opts)
        self.initialized = True

    def get_embedding(self, text: str, is_query: bool = True) -> list:
        # E5 model expects query: or passage: prefix
        prefix = "query: " if is_query else "passage: "
        full_text = f"{prefix}{text.strip()}"
        
        # Tokenize
        encoded = self.tokenizer.encode(full_text)
        
        # Prepare inputs
        input_ids = np.array([encoded.ids], dtype=np.int64)
        attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
        token_type_ids = np.array([encoded.type_ids], dtype=np.int64)
        
        inputs = {
            "input_ids": input_ids,
            "attention_mask": attention_mask
        }
        
        # Check model inputs dynamically
        model_inputs = [x.name for x in self.session.get_inputs()]
        if "token_type_ids" in model_inputs:
            inputs["token_type_ids"] = token_type_ids
            
        # Run inference
        outputs = self.session.run(None, inputs)
        
        # Output 0 is the last_hidden_state (batch_size, seq_len, hidden_dim)
        last_hidden_state = outputs[0]
        
        # Mean Pooling
        mask = attention_mask[:, :, np.newaxis]
        sum_embeddings = np.sum(last_hidden_state * mask, axis=1)
        sum_mask = np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)
        mean_pooled = sum_embeddings / sum_mask
        
        # L2 Normalization
        norm = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
        norm = np.clip(norm, a_min=1e-9, a_max=None)
        normalized = (mean_pooled / norm)[0]  # Get first item of the batch
        
        # Pad to 3072 dimensions with constant 0
        padded = np.pad(normalized, (0, 3072 - len(normalized)), 'constant').tolist()
        return padded

# Global instance for thread-safe reuse
_onnx_engine = None

def get_onnx_embedding(text: str, is_query: bool = True) -> list:
    global _onnx_engine
    if _onnx_engine is None:
        _onnx_engine = ONNXEmbeddingEngine()
    return _onnx_engine.get_embedding(text, is_query)
