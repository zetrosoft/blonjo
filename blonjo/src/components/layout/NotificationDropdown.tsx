import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, ShoppingBag, ExternalLink, Clock, Phone, User, CheckCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { playNotificationSound } from '../../lib/sound';

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  customer_name?: string;
  customer_phone?: string;
  order_summary?: string;
  source: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const prevUnreadRef = useRef<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res: any = await apiClient.get('/notifications/unread-count');
      const count = res?.unread_count || 0;
      
      // Jika ada notifikasi baru bertambah, bunyikan alert suara!
      if (count > prevUnreadRef.current && prevUnreadRef.current !== 0) {
        playNotificationSound();
      }
      prevUnreadRef.current = count;
      setUnreadCount(count);
    } catch (err) {
      // Silent error on polling
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await apiClient.get('/notifications?limit=20');
      if (Array.isArray(res)) {
        setNotifications(res);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling unread count setiap 12 detik
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 12000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Load notifikasi detail saat dropdown dibuka
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      prevUnreadRef.current = 0;
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  };

  const handleProcessOrder = (notif: NotificationItem) => {
    handleMarkAsRead(notif.id);
    setIsOpen(false);
    // Simpan pesan ke sessionStorage agar bisa di-paste/di-load otomatis di halaman input transaksi
    sessionStorage.setItem('blonjo_quick_order_text', notif.message);
    navigate('/transactions/input-transaksi');
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
        title="Notifikasi Pesanan"
        aria-label="Notifikasi"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Pesanan & Notifikasi</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 font-medium px-2 py-0.5 rounded-full">
                  {unreadCount} baru
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-accent transition-colors"
                  title="Tandai semua dibaca"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Semua</span>
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Memuat notifikasi...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Belum ada pesanan baru</p>
                <p className="text-xs opacity-70 mt-0.5">Pesanan masuk dari WhatsApp akan muncul di sini</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleProcessOrder(notif)}
                  className={`p-3.5 hover:bg-accent/50 cursor-pointer transition-colors ${
                    !notif.is_read ? 'bg-primary/5 dark:bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-green-500" />
                      <span className="font-semibold text-xs text-foreground truncate">
                        {notif.customer_name || 'Customer WhatsApp'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(notif.created_at)}</span>
                    </div>
                  </div>

                  {notif.customer_phone && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="w-3 h-3 text-emerald-500" />
                      <span>{notif.customer_phone}</span>
                    </div>
                  )}

                  <div className="mt-1.5 text-xs text-foreground/90 bg-background/80 dark:bg-background/40 p-2 rounded-lg border border-border/50 line-clamp-2 italic font-mono">
                    "{notif.message}"
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px]">
                    <span className="text-primary font-medium flex items-center gap-1 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Proses Transaksi
                    </span>
                    {!notif.is_read && (
                      <button
                        onClick={(e) => handleMarkAsRead(notif.id, e)}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-background border border-transparent hover:border-border"
                        title="Tandai sudah dibaca"
                      >
                        <Check className="w-3 h-3" /> Selesai
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
