import re
from typing import List

def legal_semantic_splitter(text: str) -> List[str]:
    """
    Layout-Aware Semantic Text Splitter untuk Dokumen Hukum Indonesia.
    
    Fungsi ini memotong teks berdasarkan penanda semantik hukum (seperti "Pasal" dan "BAB")
    untuk memastikan bahwa konteks utuh dari setiap Pasal (termasuk ayat dan huruf di bawahnya)
    tetap terjaga dalam satu kesatuan chunk, sehingga sangat optimal untuk proses RAG (Retrieval-Augmented Generation).
    
    Dilarang memotong berdasarkan jumlah karakter (character count).
    
    Args:
        text (str): Teks mentah dari dokumen hukum (misal: UU, Perpu, KUHP).
        
    Returns:
        List[str]: Daftar potongan teks (chunks) di mana setiap elemen merupakan 
                   satu Pasal utuh (atau bagian BAB/Mukadimah).
    """
    if not text or not text.strip():
        return []

    # Pendekatan regex finditer untuk memindai posisi awal setiap Pasal atau BAB
    # (?m) mengaktifkan mode multiline sehingga ^ cocok dengan awal setiap baris.
    # Mencocokkan:
    # 1. "BAB " diikuti angka Romawi.
    # 2. "Pasal " diikuti angka.
    pattern = re.compile(r"(?m)^(BAB\s+[IVXLCDM]+|Pasal\s+\d+)")
    
    matches = list(pattern.finditer(text))
    
    if not matches:
        # Jika tidak ada pola Pasal/BAB yang ditemukan, kembalikan teks utuh
        return [text.strip()]
        
    chunks: List[str] = []
    
    # Ambil bagian sebelum match pertama (misal: Konsiderans, Menimbang, Mengingat)
    first_match_start = matches[0].start()
    if first_match_start > 0:
        intro_text = text[:first_match_start].strip()
        if intro_text:
            chunks.append(intro_text)
            
    # Iterasi melalui match untuk memotong teks secara presisi
    for i in range(len(matches)):
        start_idx = matches[i].start()
        # Batas akhir chunk adalah awal dari match berikutnya, atau akhir string
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(text)
        
        chunk_text = text[start_idx:end_idx].strip()
        if chunk_text:
            chunks.append(chunk_text)
            
    return chunks
