# Plan: Fitur Multi-Item Pricing Rule (Satu Input → Banyak Rule)

## 🎯 Tujuan
User bisa menulis aturan harga untuk **banyak produk sekaligus** dalam satu textarea, lalu sistem otomatis memparse, mempratinjau, dan menyimpan semua rule sekaligus.

---

## 🔍 Kondisi Saat Ini

```
Input user (multi-produk)
        ↓
Backend parse → AI return 1 rule JSON
        ↓
Frontend preview 1 rule → Save 1 rule
```

**Masalah:** AI engine & frontend hanya menangani **satu rule per request**.

---

## ✅ Target Setelah Fitur Ini

```
Input user (multi-produk)
        ↓
Backend parse → AI return ARRAY of rule JSON
        ↓
Frontend preview semua rule (card per produk)
        ↓
Save All → Loop POST ke API → Semua tersimpan
```

---

## 📋 Rencana Kerja

### Phase 1 — Backend: AI Return Array

**File:** `sajen/app/services/ai_engine.py` → `parse_pricing_rule()`

**Perubahan:**
- Update `system_instruction` untuk instruksikan AI output **array JSON** (`[]`) jika ada lebih dari satu produk
- Contoh output target:
  ```json
  [
    { "name": "Tiered Telur", "rule_type": "tiered", "rule_payload": { "product_name": "Telur", "tiers": [...] } },
    { "name": "Bundle Indomie", "rule_type": "bundle_multiple", "rule_payload": { "product_name": "Indomie", "bundle_rules": {...} } }
  ]
  ```
- Tetap support **single rule** (object `{}`) untuk backward compat

**File:** `sajen/app/api/v1/inventory.py` → endpoint `POST /pricing-rules/parse`

**Perubahan:**
- Normalize response: jika AI return object `{}` → wrap jadi `[{}]`
- Selalu return `array` ke frontend
- Tambah `multi_rule` flag di response header (opsional)

---

### Phase 2 — Frontend: Multi Preview Cards

**File:** `blonjo/src/pages/master-data/PricingRulePage.tsx`

**Perubahan state:**
```ts
// Sekarang
const [parsedRule, setParsedRule] = useState<any>(null);

// Nanti
const [parsedRules, setParsedRules] = useState<any[]>([]);
```

**UI:** Tampilkan **scrollable list preview cards** (satu card per rule):
- Setiap card punya: Badge tipe, nama produk, detail payload, tombol ❌ remove individual
- Di bawah semua card: tombol **"Simpan Semua (N rule)"**
- Produk yang tidak ditemukan di katalog → highlight warning kuning per card

**Product matching:** Loop `matchProductForRule()` untuk setiap item dalam array.

---

### Phase 3 — Frontend: Bulk Save

**Perubahan `handleSave()`:**
```ts
// Loop semua parsed rules
const results = await Promise.allSettled(
  parsedRules.map(rule => fetchClient('/inventory/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(rule)
  }))
);

// Laporan: berapa sukses, berapa gagal
const success = results.filter(r => r.status === 'fulfilled').length;
const failed = results.filter(r => r.status === 'rejected').length;
toast.success(`${success} rule berhasil disimpan${failed ? `, ${failed} gagal` : ''}`);
```

---

### Phase 4 — UX Polish

- [ ] **Counter info** di atas textarea: *"Terdeteksi: 3 produk"* (real-time saat user mengetik)
- [ ] **Per-card edit** sebelum save: user bisa ubah field manual di masing-masing card
- [ ] **Warning** jika produk tidak ada di katalog → tawaran untuk skip atau buat baru
- [ ] Placeholder textarea diperbarui kembali untuk support multi-item

---

## 📁 File yang Akan Diubah

| File | Jenis Perubahan |
|------|----------------|
| `sajen/app/services/ai_engine.py` | Update system prompt → output array JSON |
| `sajen/app/api/v1/inventory.py` | Normalize response selalu array |
| `blonjo/src/pages/master-data/PricingRulePage.tsx` | State array, multi-preview UI, bulk save |
| `blonjo/src/lib/i18n.ts` | Update placeholder kembali support multi-item |

---

## ⚡ Estimasi Kompleksitas

| Phase | Kompleksitas | Catatan |
|-------|-------------|---------|
| Phase 1 (Backend AI) | 🟡 Medium | Perlu tuning prompt AI agar konsisten output array |
| Phase 2 (Multi Preview) | 🟡 Medium | Refactor state + UI cards |
| Phase 3 (Bulk Save) | 🟢 Mudah | `Promise.allSettled` loop |
| Phase 4 (UX Polish) | 🟡 Medium | Tergantung kedalaman fitur edit per-card |

> [!IMPORTANT]
> Phase 1 adalah kunci. Jika AI tidak konsisten output array, seluruh chain akan rusak. Perlu test prompt extensively sebelum lanjut ke Phase 2.

> [!NOTE]
> Untuk sementara, placeholder sudah diperbarui agar user tidak bingung (sudah di-deploy). Fitur multi-item akan aktif setelah Phase 1-3 selesai.
