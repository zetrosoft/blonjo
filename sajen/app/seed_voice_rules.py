import sys
import os
import json

# Append the current directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.setting import AppSetting

def seed_voice_rules():
    db: Session = SessionLocal()
    try:
        voice_rules = [
            {"pattern": "enter", "replacement": "\n", "description": "Ubah kata 'enter' menjadi baris baru"},
            {"pattern": "a keong|saunya", "replacement": "@", "description": "Ubah 'a keong' atau 'saunya' menjadi @"},
            {"pattern": "(\\d+)\\s+kali\\s+(\\d+)", "replacement": "$1x$2", "description": "Ubah format '{n} kali {n}' menjadi '{n}x{n}'"},
            {"pattern": "strip|bulet", "replacement": "- ", "description": "Ubah kata 'strip' atau 'bulet' menjadi tanda list (-)"},
            {"pattern": "sama dengan", "replacement": "=", "description": "Ubah kata 'sama dengan' menjadi simbol ="},
            {"pattern": "plus", "replacement": "+", "description": "Ubah kata 'plus' menjadi simbol +"},
            {"pattern": "minus", "replacement": "-", "description": "Ubah kata 'minus' menjadi simbol -"},
            {"pattern": "stop|selesai", "replacement": "[STOP]", "description": "Berhenti merekam suara secara otomatis"},
            # Nominal Uang
            {"pattern": "\\\\b(\\\\d+)\\\\s*ribu\\\\b", "replacement": "\\\\1000", "description": "Mengubah '50 ribu' -> '50000'"},
            {"pattern": "\\\\b(\\\\d+)\\\\s*juta\\\\b", "replacement": "\\\\1000000", "description": "Mengubah '2 juta' -> '2000000'"},
            {"pattern": "\\\\brupiah\\\\b", "replacement": "", "description": "Menghapus kata 'rupiah'"},
            {"pattern": "\\\\bsetengah\\\\s*ribu\\\\b", "replacement": "500", "description": "Mengubah 'setengah ribu' -> '500'"},
            {"pattern": "\\\\bsetengah\\\\s*juta\\\\b", "replacement": "500000", "description": "Mengubah 'setengah juta' -> '500000'"},
            # Satuan & Pecahan UoM
            {"pattern": "\\\\bsetengah\\\\s*(?:kilo|kg)\\\\b", "replacement": "0.5 kg", "description": "Mengubah 'setengah kilo' -> '0.5 kg'"},
            {"pattern": "\\\\bseperempat\\\\s*(?:kilo|kg)\\\\b", "replacement": "0.25 kg", "description": "Mengubah 'seperempat kg' -> '0.25 kg'"},
            {"pattern": "\\\\bsatu\\\\s*(?:kilo|kg)\\\\b", "replacement": "1 kg", "description": "Mengubah 'satu kilo' -> '1 kg'"},
            {"pattern": "\\\\bdua\\\\s*(?:kilo|kg)\\\\b", "replacement": "2 kg", "description": "Mengubah 'dua kilo' -> '2 kg'"},
            {"pattern": "\\\\btiga\\\\s*(?:kilo|kg)\\\\b", "replacement": "3 kg", "description": "Mengubah 'tiga kilo' -> '3 kg'"},
            {"pattern": "\\\\blusin\\\\b", "replacement": "12 pcs", "description": "Mengubah 'lusin' -> '12 pcs'"},
            {"pattern": "\\\\bsetengah\\\\s*lusin\\\\b", "replacement": "6 pcs", "description": "Mengubah 'setengah lusin' -> '6 pcs'"},
            {"pattern": "\\\\bkodi\\\\b", "replacement": "20 pcs", "description": "Mengubah 'kodi' -> '20 pcs'"},
            {"pattern": "\\\\bdus|karton\\\\b", "replacement": "box", "description": "Mengubah 'dus/karton' -> 'box'"},
            {"pattern": "\\\\bbiji|buah\\\\b", "replacement": "pcs", "description": "Mengubah 'biji/buah' -> 'pcs'"},
            # Pembayaran & Jurnal
            {"pattern": "\\\\bbayar\\\\s+tunai\\\\b", "replacement": "bayar cash", "description": "Menyelaraskan 'bayar tunai' -> 'bayar cash'"},
            {"pattern": "\\\\bsecara\\\\s+transfer\\\\b", "replacement": "via bank", "description": "Menyelaraskan 'secara transfer' -> 'via bank'"},
            {"pattern": "\\\\butang\\\\s+ke\\\\b", "replacement": "utang", "description": "Menyederhanakan 'utang ke' -> 'utang'"},
            {"pattern": "\\\\bpiutang\\\\s+dari\\\\b", "replacement": "piutang", "description": "Menyederhanakan 'piutang dari' -> 'piutang'"},
            {"pattern": "\\\\bngutang|ngebon\\\\b", "replacement": "utang", "description": "Menyederhanakan dialek 'ngutang' -> 'utang'"},
            {"pattern": "\\\\bpersen|persentase\\\\b", "replacement": "%", "description": "Mengubah 'persen' -> '%'"},
            # Casing Produk Warung
            {"pattern": "\\\\bindomi|indomie\\\\b", "replacement": "Indomie", "description": "Koreksi penulisan 'Indomie'"},
            {"pattern": "\\\\btelor|telur\\\\b", "replacement": "Telor", "description": "Koreksi penulisan 'Telor'"},
            {"pattern": "\\\\bberas\\\\b", "replacement": "Beras", "description": "Koreksi penulisan 'Beras'"},
            {"pattern": "\\\\bminyak\\\\b", "replacement": "Minyak", "description": "Koreksi penulisan 'Minyak'"},
            {"pattern": "\\\\bgula\\\\b", "replacement": "Gula", "description": "Koreksi penulisan 'Gula'"},
            {"pattern": "\\\\bterigu\\\\b", "replacement": "Terigu", "description": "Koreksi penulisan 'Terigu'"},
            {"pattern": "\\\\bkopi\\\\b", "replacement": "Kopi", "description": "Koreksi penulisan 'Kopi'"},
            {"pattern": "\\\\bsusu\\\\b", "replacement": "Susu", "description": "Koreksi penulisan 'Susu'"},
            {"pattern": "\\\\bteh\\\\b", "replacement": "Teh", "description": "Koreksi penulisan 'Teh'"},
            {"pattern": "\\\\brokok\\\\b", "replacement": "Rokok", "description": "Koreksi penulisan 'Rokok'"},
            {"pattern": "\\\\baqua\\\\b", "replacement": "Aqua", "description": "Koreksi penulisan 'Aqua'"},
            {"pattern": "\\\\ble\\\\s+minerale|le\\\\s+mineral\\\\b", "replacement": "Le Minerale", "description": "Koreksi penulisan 'Le Minerale'"}
        ]
        
        json_value = json.dumps(voice_rules)
        
        # Cek apakah sudah ada setting global voice_rules
        setting = db.query(AppSetting).filter(
            AppSetting.tenant_id.is_(None),
            AppSetting.key == "voice_rules"
        ).first()

        if not setting:
            print("Seeding global voice_rules...")
            new_setting = AppSetting(
                tenant_id=None,
                key="voice_rules",
                value=json_value,
                description="Global default voice rules"
            )
            db.add(new_setting)
            print("Successfully seeded global voice_rules.")
        else:
            print("Updating global voice_rules with comprehensive defaults...")
            setting.value = json_value
            setting.description = "Global default voice rules"
            print("Successfully updated global voice_rules.")
            
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    seed_voice_rules()
