# Blonjo DB - AI Semantic Context & Ontology

## BAGIAN 1: PENGETAHUAN DASAR SEMANTIK (GLOBAL BASELINE)
Kamus dasar ini berlaku untuk semua entitas. Aturan spesifik per-tenant yang dipelajari AI dari percakapan akan ditarik dari tabel `vibes_memory` dan digabungkan dengan daftar ini saat *runtime*.

*   **"Kulakan", "Belanja", "Barang Masuk":** Merujuk pada `transactions.transaction_type = 'PURCHASE'`.
*   **"Penjualan", "Kasir", "Terjual":** Merujuk pada `transactions.transaction_type = 'SALES'`.
*   **"Suplier", "Distributor":** Entitas di tabel `contacts` yang berelasi ke transaksi `PURCHASE`.
*   **"Jatuh Tempo":** Merujuk pada `transactions.due_date`. Menandakan Utang/Piutang.
*   **"Retur", "Barang Rusak":** Merujuk pada `inventory_logs.log_type = 'waste'` atau tabel `stock_discards`.
*   **"Kas", "Uang Tunai":** Akun di `accounts` berjenis Kas/Bank.
*   **"Jurnal", "Pembukuan":** Mencatat Debit/Kredit dari transaksi di `journal_entries`.

---

## BAGIAN 2: UML CLASS DIAGRAM (SELURUH TABEL)
Untuk menghindari ukuran gambar yang menyusut saat dirender, keseluruhan 38 tabel dipecah menjadi **9 Modul Kecil (Micro-Modules)**. Relasi ke tabel di luar modul digambarkan dengan kotak kelas kosong.

### 1. Transaksi & Log Inventaris

```mermaid
classDiagram
    class transactions {
        +integer id : PK
        +date transaction_date
        +character_varying reference_no
        +text description
        +USER-DEFINED transaction_type
        +numeric total_amount
        +integer created_by_id : FK
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer tenant_id : FK
        +USER-DEFINED status
        +character_varying payment_method
        +date due_date
    }
    class inventory_logs {
        +integer id : PK
        +integer product_id : FK
        +integer transaction_id : FK
        +numeric quantity
        +numeric price_per_unit
        +character_varying log_type
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer contact_id : FK
        +numeric discount_value
        +boolean is_percent
        +boolean is_manual_correction
    }
    class contacts {
        +integer id : PK
        +character_varying name
        +character_varying contact_type
        +character_varying phone
        +numeric current_balance
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer tenant_id : FK
        +character_varying address
        +character_varying sales_visit_day
        +integer sales_visit_interval
    }

    class tenants
    class users
    tenants "1" --> "*" transactions : tenant_id
    users "1" --> "*" transactions : created_by_id
    transactions "1" --> "*" inventory_logs : transaction_id
    contacts "1" --> "*" inventory_logs : contact_id
```

---

### 2. Katalog Produk & Varian

```mermaid
classDiagram
    class products {
        +integer id : PK
        +character_varying sku
        +character_varying name
        +USER-DEFINED embedding
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer category_id : FK
        +integer category_id : FK
        +character_varying base_unit
    }
    class product_categories {
        +integer id : PK
        +character_varying name
        +character_varying description
        +boolean is_active
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class uoms {
        +integer id : PK
        +character_varying code
        +character_varying name
        +character_varying category
        +character_varying description
        +character_varying status
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class product_unit_conversions {
        +integer id : PK
        +integer product_id : FK
        +character_varying unit_name
        +numeric multiplier
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class commodity_trends {
        +integer id : PK
        +integer product_id : FK
        +character_varying commodity_name
        +character_varying source
        +numeric price
        +character_varying unit
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    product_categories "1" --> "*" products : category_id
    products "1" --> "*" product_unit_conversions : product_id
    products "1" --> "*" commodity_trends : product_id
```

---

### 3. Harga & Aturan Diskon

```mermaid
classDiagram
    class tenant_product_prices {
        +integer id : PK
        +integer tenant_id : FK
        +integer product_id : FK
        +character_varying pricing_method
        +numeric amount
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +boolean auto_adjusted
    }
    class tenant_pricing_rules {
        +integer id : PK
        +integer tenant_id : FK
        +integer product_id : FK
        +character_varying name
        +character_varying rule_type
        +date valid_from
        +date valid_to
        +boolean is_active
        +json rule_payload
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    class tenants
    class products
    tenants "1" --> "*" tenant_product_prices : tenant_id
    products "1" --> "*" tenant_product_prices : product_id
    tenants "1" --> "*" tenant_pricing_rules : tenant_id
    products "1" --> "*" tenant_pricing_rules : product_id
```

---

### 4. Rencana Belanja (PO) & Pembuangan

```mermaid
classDiagram
    class purchase_plans {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying status
        +boolean send_via_wa
        +boolean send_via_email
        +numeric total_amount
        +date planned_date
        +date created_at
        +timestamp_with_time_zone updated_at
    }
    class purchase_plan_items {
        +integer id : PK
        +integer purchase_plan_id : FK
        +integer product_id : FK
        +integer supplier_contact_id : FK
        +numeric qty
        +numeric unit_price
        +numeric subtotal
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +character_varying custom_product_name
        +boolean is_purchased
    }
    class stock_discards {
        +integer id : PK
        +integer tenant_id : FK
        +integer product_id : FK
        +numeric qty
        +character_varying reason
        +date created_at
        +timestamp_with_time_zone updated_at
    }
    class tenant_inventories {
        +integer id : PK
        +integer tenant_id : FK
        +integer product_id : FK
        +numeric last_purchase_price
        +numeric moving_average_cost
        +numeric static_stock
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +numeric safety_stock
        +numeric reorder_point
        +numeric max_stock
        +integer preferred_supplier_id : FK
        +character_varying shelf_location
    }

    class tenants
    class products
    class contacts
    tenants "1" --> "*" purchase_plans : tenant_id
    tenants "1" --> "*" stock_discards : tenant_id
    tenants "1" --> "*" tenant_inventories : tenant_id
    products "1" --> "*" purchase_plan_items : product_id
    products "1" --> "*" stock_discards : product_id
    products "1" --> "*" tenant_inventories : product_id
    contacts "1" --> "*" purchase_plan_items : supplier_contact_id
    contacts "1" --> "*" tenant_inventories : preferred_supplier_id
    purchase_plans "1" --> "*" purchase_plan_items : purchase_plan_id
```

---

### 5. Buku Besar (Akuntansi)

```mermaid
classDiagram
    class accounts {
        +integer id : PK
        +character_varying code
        +character_varying name
        +USER-DEFINED account_type
        +boolean is_active
        +integer parent_id : FK
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer tenant_id : FK
    }
    class journal_entries {
        +integer id : PK
        +integer transaction_id : FK
        +integer account_id : FK
        +numeric debit
        +numeric credit
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class journal_mappings {
        +integer id : PK
        +integer tenant_id : FK
        +USER-DEFINED transaction_type
        +character_varying description
        +boolean is_active
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class journal_mapping_lines {
        +integer id : PK
        +integer mapping_id : FK
        +integer account_id : FK
        +character_varying side
        +character_varying value_type
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class cashflow_projection_snapshots {
        +integer id : PK
        +integer tenant_id : FK
        +date projection_date
        +date target_date
        +numeric projected_inflow
        +numeric projected_outflow
        +numeric projected_net
        +numeric actual_inflow
        +numeric actual_outflow
        +numeric actual_net
        +character_varying note
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    class tenants
    class transactions
    tenants "1" --> "*" accounts : tenant_id
    tenants "1" --> "*" journal_mappings : tenant_id
    tenants "1" --> "*" cashflow_projection_snapshots : tenant_id
    transactions "1" --> "*" journal_entries : transaction_id
    accounts "1" --> "*" accounts : parent_id
    journal_mappings "1" --> "*" journal_mapping_lines : mapping_id
    accounts "1" --> "*" journal_mapping_lines : account_id
```

---

### 6. Multi-Tenant & Akses Pengguna

```mermaid
classDiagram
    class tenants {
        +integer id : PK
        +character_varying name
        +character_varying subdomain
        +character_varying status
        +integer ocr_quota_monthly
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +boolean maintenance_stock
        +boolean default_po_channel_wa
        +boolean default_po_channel_email
    }
    class users {
        +integer id : PK
        +character_varying email
        +character_varying hashed_password
        +character_varying full_name
        +USER-DEFINED role
        +boolean is_active
        +character_varying preferred_language
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +integer tenant_id : FK
        +boolean is_superuser
    }
    class roles {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying name
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class user_roles {
        +integer user_id : PK, FK
        +integer role_id : PK, FK
    }
    class role_permissions {
        +integer role_id : PK, FK
        +integer permission_id : PK, FK
    }
    class permissions {
        +integer id : PK
        +character_varying name
        +character_varying description
        +boolean is_system_only
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    tenants "1" --> "*" users : tenant_id
    tenants "1" --> "*" roles : tenant_id
    roles "1" --> "*" user_roles : role_id
    users "1" --> "*" user_roles : user_id
    roles "1" --> "*" role_permissions : role_id
    permissions "1" --> "*" role_permissions : permission_id
```

---

### 7. Sesi AI & Memori (Vibes Chat)

```mermaid
classDiagram
    class vibe_chat_sessions {
        +integer id : PK
        +integer tenant_id : FK
        +integer user_id : FK
        +character_varying title
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class vibe_chat_messages {
        +integer id : PK
        +integer session_id : FK
        +character_varying role
        +text content
        +json sources
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class vibes_memory {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying memory_type
        +text content
        +integer importance_score
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    class users
    class tenants
    users "1" --> "*" vibe_chat_sessions : user_id
    tenants "1" --> "*" vibe_chat_sessions : tenant_id
    tenants "1" --> "*" vibes_memory : tenant_id
    vibe_chat_sessions "1" --> "*" vibe_chat_messages : session_id
```

---

### 8. Pemrosesan OCR (Nota)

```mermaid
classDiagram
    class ocr_tasks {
        +integer id : PK
        +integer user_id : FK
        +character_varying file_name
        +character_varying file_path
        +USER-DEFINED status
        +json extracted_data
        +character_varying error_message
        +json corrected_data
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
        +text raw_ocr_text
        +integer tenant_id : FK
        +character_varying image_hash
    }
    class ocr_feedback {
        +integer id : PK
        +integer ocr_task_id : FK
        +character_varying field_name
        +text original_value
        +text corrected_value
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class supplier_parsing_rules {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying supplier_pattern
        +character_varying rule_category
        +text rule_instruction
        +json sample_diff
        +integer confidence_count
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class ocr_alias_mappings {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying entity_type
        +character_varying raw_pattern
        +character_varying corrected_value
        +integer confidence_count
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }

    class users
    class tenants
    users "1" --> "*" ocr_tasks : user_id
    tenants "1" --> "*" ocr_tasks : tenant_id
    tenants "1" --> "*" supplier_parsing_rules : tenant_id
    tenants "1" --> "*" ocr_alias_mappings : tenant_id
    ocr_tasks "1" --> "*" ocr_feedback : ocr_task_id
```

---

### 9. Log Sistem & Cache

```mermaid
classDiagram
    class ai_parsing_logs {
        +integer id : PK
        +integer tenant_id : FK
        +text original_text
        +text prompt
        +text parsed_result
        +integer token_in
        +integer token_out
        +character_varying processor
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class ai_model_quotas {
        +integer id : PK
        +character_varying model_name
        +timestamp_without_time_zone usage_date
        +integer request_count
        +integer token_count
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class gemini_model_cache {
        +integer id : PK
        +jsonb models_json
        +timestamp_with_time_zone updated_at
    }
    class mcp_request_logs {
        +integer id : PK
        +text prompt
        +text response
        +character_varying model_used
        +integer token_in
        +integer token_out
        +character_varying tool_name
        +timestamp_with_time_zone created_at
    }
    class app_settings {
        +integer id : PK
        +integer tenant_id : FK
        +character_varying key
        +character_varying value
        +character_varying description
        +timestamp_with_time_zone created_at
        +timestamp_with_time_zone updated_at
    }
    class alembic_version {
        +character_varying version_num : PK
    }

    class tenants
    tenants "1" --> "*" ai_parsing_logs : tenant_id
    tenants "1" --> "*" ai_model_quotas : tenant_id
    tenants "1" --> "*" app_settings : tenant_id
```

---

