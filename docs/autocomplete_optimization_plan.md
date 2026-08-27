# Rencana Kerja: Optimalisasi Autocomplete Smart Note (Rev 2.0)

Rencana ini bertujuan untuk membatasi pemicu dropdown autocomplete pada Smart Note agar hanya muncul untuk kata-kata yang bermakna nama barang (berbasis kata, bukan kemiripan huruf acak), serta menempatkan posisi dropdown secara dinamis tepat di bawah baris kursor kata pemicunya agar tidak menutupi tulisan aktif.

---

## 1. Pendekatan Solusi (Approach)
1. **Penyaringan Berbasis Kata (Word-based Matching)**: Pada backend API `/autocomplete-semantic`, kita akan mengekstrak kata-kata kunci dari kueri dan mencocokkannya ke awalan kata (*word-prefix*) pada nama produk di database. Jika tidak ada kecocokan kata sama sekali, kueri diabaikan.
2. **Penyaringan Kata Non-Barang (Stopwords Filter)**: Kata-kata transaksi umum (seperti *selisih, uang, tunai, gaji, bayar, dll.*) akan ditambahkan ke daftar kata yang dikecualikan (*stop words*). Jika kueri hanya berisi kata non-barang, dropdown tidak akan dipicu.
3. **Reposisi Dinamis di Bawah Kursor Pemicu (Caret Tracking)**: Di frontend, kita akan mengimplementasikan fungsi pelacak koordinat kursor (`getCaretCoordinates`) menggunakan elemen "cermin" (*mirror element*) sementara di memori DOM. Koordinat top/left ini akan diaplikasikan langsung pada inline style dropdown suggestions sehingga posisinya selalu presisi di bawah kata yang memicu dropdown.

---

## 2. Cakupan Kerja (Scope)

- **Masuk (In)**:
  - Modifikasi endpoint `/autocomplete-semantic` di berkas [/Users/user/kerjaan/jualan/sajen/app/api/v1/inventory.py](file:///Users/user/kerjaan/jualan/sajen/app/api/v1/inventory.py) untuk menyaring kata non-barang dan mencocokkan kemiripan berbasis kata (word overlap).
  - Modifikasi kelas CSS dan inline style dropdown pada berkas [/Users/user/kerjaan/jualan/blonjo/src/components/SmartTextarea.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/components/SmartTextarea.tsx) untuk menggunakan koordinat dinamis kursor.
- **Keluar (Out)**:
  - Mengubah struktur database `products`.

---

## 3. Langkah-Langkah Aksi (Action Items)

### Fase 1: Optimasi Backend Autocomplete (inventory.py)
- [ ] **Define Stop Words**: Tambahkan daftar kata non-barang akuntansi umum di backend.
- [ ] **Implement Word Overlap Validation**: Modifikasi logic `/autocomplete-semantic` agar melakukan validasi kecocokan awalan kata (*word-prefix*) antara input kueri dengan nama produk di database.
- [ ] **Apply Similarity Score Threshold**: Hanya mengembalikan produk yang memiliki nilai kemiripan vektor di atas batas minimum (misal: `>= 0.35`) dan lolos validasi kata.

### Fase 2: Reposisi Dinamis Dropdown (SmartTextarea.tsx)
- [ ] **Implement Caret Coordinate Helper**: Tulis fungsi pembantu `getCaretCoordinates` di `SmartTextarea.tsx` yang membuat mirror element sementara untuk mendapatkan koordinat (X, Y) dari kursor text.
- [ ] **Update Suggestion Position Style**: Simpan koordinat kursor ke dalam state `coords` (`{ top: number, left: number }`) setiap kali autocomplete dipicu, dan aplikasikan sebagai inline style `style={{ top: coords.top, left: coords.left }}` pada overlay suggestions.
- [ ] **Add Scroll Offset Handling**: Sesuaikan koordinat Y dengan nilai `scrollTop` dari textarea saat discroll.

### Fase 3: Validasi & Deployment
- [ ] **Test Autocomplete Behavior**: Uji coba mengetik kata non-barang (seperti *"selisih"*, *"tunai"*, *"uang"*) dan pastikan dropdown tidak muncul. Uji coba mengetik kata produk (seperti *"minyak"*) dan pastikan dropdown muncul tepat di bawah kata pemicunya.
- [ ] **Deploy Updates**: Deploy perubahan ke kontainer `sajen-api` dan `blonjo-ui` di VPS.
