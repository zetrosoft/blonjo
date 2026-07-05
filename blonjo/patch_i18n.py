import re

with open("src/lib/i18n.ts", "r") as f:
    content = f.read()

# For English
en_repl = '''"mc_title": "My Catalog",
      "mc_toast_update_success": "Price & Stock updated successfully",
      "mc_toast_update_failed": "Failed to update catalog item",
      "mc_edit_catalog_title": "Edit Product Details",'''
content = re.sub(r'"mc_title":\s*"My Catalog",', en_repl, content)

# For Indonesian
id_repl = '''"mc_title": "Katalog Saya",
      "mc_toast_update_success": "Harga & Stok berhasil diperbarui",
      "mc_toast_update_failed": "Gagal memperbarui item katalog",
      "mc_edit_catalog_title": "Ubah Detail Produk",'''
content = re.sub(r'"mc_title":\s*"Katalog Saya",', id_repl, content)

with open("src/lib/i18n.ts", "w") as f:
    f.write(content)
print("i18n patched!")
