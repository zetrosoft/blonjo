import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "login_title": "Sign In to Blonjo",
      "login_subtitle": "Manage your UMKM business seamlessly",
      "email_label": "Email Address",
      "password_label": "Password",
      "sign_in_button": "Sign In",
      "signing_in": "Signing in...",
      "dashboard_title": "Dashboard",
      "dashboard_subtitle": "Overview of your business performance",
      "welcome_back": "Welcome back",
      "sign_out_button": "Sign Out",
      "invalid_email": "Invalid email address",
      "password_min": "Password must be at least 6 characters",
      "unexpected_error": "An unexpected error occurred.",
      
      "menu_dashboard": "Dashboard",
      "menu_transactions": "Transactions",
      "menu_ocr": "Scan Receipts",
      "menu_coa": "Chart of Accounts",
      "menu_reports": "Accounting Reports",
      "menu_insights": "Business Insights",
      "menu_settings": "Settings",
      
      "total_revenue": "Total Revenue",
      "total_expense": "Total Expenses",
      "net_profit": "Net Profit",
      "from_last_month": "from last month",
      
      "recent_transactions": "Recent Transactions",
      "quick_actions": "Quick Actions",
      "scan_receipt": "Smart Scan Receipt",
      "scan_receipt_desc": "Upload a handwritten or printed receipt. AI will automatically record the transaction.",
      "upload_button": "Upload Document"
    }
  },
  id: {
    translation: {
      "login_title": "Masuk ke Blonjo",
      "login_subtitle": "Kelola bisnis UMKM Anda dengan mulus",
      "email_label": "Alamat Email",
      "password_label": "Kata Sandi",
      "sign_in_button": "Masuk",
      "signing_in": "Sedang masuk...",
      "dashboard_title": "Dasbor",
      "dashboard_subtitle": "Ringkasan performa bisnis Anda",
      "welcome_back": "Selamat datang kembali",
      "sign_out_button": "Keluar",
      "invalid_email": "Format email tidak valid",
      "password_min": "Kata sandi minimal 6 karakter",
      "unexpected_error": "Terjadi kesalahan yang tidak terduga.",
      
      "menu_dashboard": "Dasbor",
      "menu_transactions": "Transaksi",
      "menu_ocr": "Pindai Nota",
      "menu_coa": "Daftar Akun (COA)",
      "menu_reports": "Laporan Akuntansi",
      "menu_insights": "Wawasan Bisnis",
      "menu_settings": "Pengaturan",
      
      "total_revenue": "Total Pendapatan",
      "total_expense": "Total Pengeluaran",
      "net_profit": "Laba Bersih",
      "from_last_month": "dari bulan lalu",
      
      "recent_transactions": "Transaksi Terbaru",
      "quick_actions": "Aksi Cepat",
      "scan_receipt": "Pindai Nota Pintar",
      "scan_receipt_desc": "Unggah nota tulisan tangan atau cetak. AI akan mencatat transaksi secara otomatis.",
      "upload_button": "Unggah Dokumen"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'id',
    interpolation: {
      escapeValue: false, 
    },
  });

export default i18n;
