import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Camera, QrCode, AlertTriangle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (file: File) => void;
  onBarcodeScanned: (code: string) => void;
}

export function CameraModal({ isOpen, onClose, onPhotoCaptured, onBarcodeScanned }: CameraModalProps) {
  const [activeTab, setActiveTab] = useState<'photo' | 'scan'>('photo');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const qrContainerId = 'qr-reader-target';

  // Dapatkan daftar kamera
  useEffect(() => {
    if (!isOpen) return;

    navigator.mediaDevices.enumerateDevices()
      .then(deviceInfos => {
        const videoDevices = deviceInfos.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          // Pilih kamera belakang jika ada, jika tidak kamera pertama
          const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          setSelectedDeviceId(backCamera ? backCamera.deviceId : videoDevices[0].deviceId);
        }
      })
      .catch(err => {
        console.error('Error listing camera devices:', err);
      });
  }, [isOpen]);

  // Handle Photo Mode Camera Start/Stop
  useEffect(() => {
    if (isOpen && activeTab === 'photo') {
      startPhotoCamera();
    } else {
      stopPhotoCamera();
    }

    return () => {
      stopPhotoCamera();
    };
  }, [isOpen, activeTab, selectedDeviceId]);

  // Handle Scan Mode Start/Stop
  useEffect(() => {
    if (isOpen && activeTab === 'scan') {
      // Delay sedikit agar container DOM ter-render sempurna
      const timer = setTimeout(() => {
        startQRScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopQRScanner();
      };
    } else {
      stopQRScanner();
    }
  }, [isOpen, activeTab, selectedDeviceId]);

  const startPhotoCamera = async () => {
    stopPhotoCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: 'environment' }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
      setIsCameraActive(true);
    } catch (err) {
      console.error('Error starting video stream:', err);
      setHasPermission(false);
      toast.error('Gagal mengakses kamera', { description: 'Pastikan izin kamera telah diberikan.' });
    }
  };

  const stopPhotoCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startQRScanner = async () => {
    await stopQRScanner();
    try {
      const scanner = new Html5Qrcode(qrContainerId);
      qrScannerRef.current = scanner;
      setHasPermission(true);

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      };

      const cameraParam = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: 'environment' };

      await scanner.start(
        cameraParam,
        config,
        (decodedText) => {
          // Success callback
          toast.success('Kode terdeteksi!', { description: decodedText });
          onBarcodeScanned(decodedText);
          stopQRScanner();
          onClose();
        },
        (errorMessage) => {
          // Silent scan error
        }
      );
    } catch (err) {
      console.error('Error starting QR Scanner:', err);
      // fallback
    }
  };

  const stopQRScanner = async () => {
    if (qrScannerRef.current) {
      if (qrScannerRef.current.isScanning) {
        try {
          await qrScannerRef.current.stop();
        } catch (e) {
          console.error('Failed to stop qr scanner:', e);
        }
      }
      qrScannerRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `nota_camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onPhotoCaptured(file);
      onClose();
    }, 'image/jpeg', 0.95);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95%] p-4 bg-zinc-950 border-zinc-800 text-white rounded-2xl overflow-hidden">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Kamera & Pemindai Kode
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Ambil foto nota/struk belanja Anda atau pindai barcode/QR code barang.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-800 mb-4">
          <button
            onClick={() => setActiveTab('photo')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'photo'
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            Ambil Foto Nota
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'scan'
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Pindai QR / Barcode
          </button>
        </div>

        {/* Device Camera Selector if multiple devices exist */}
        {devices.length > 1 && (
          <div className="mb-3">
            <label className="text-[10px] text-zinc-500 block mb-1">Pilih Kamera:</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none focus:border-primary"
            >
              {devices.map((device, idx) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Kamera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab Content */}
        <div className="relative aspect-video w-full bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
          {hasPermission === false && (
            <div className="p-4 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-xs font-medium">Izin Kamera Ditolak</p>
              <p className="text-[10px] text-zinc-400 max-w-[200px]">Mohon izinkan akses kamera di pengaturan browser Anda.</p>
            </div>
          )}

          {activeTab === 'photo' ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {isCameraActive && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center z-10">
                  <Button
                    onClick={capturePhoto}
                    className="h-12 w-12 rounded-full border-4 border-white/40 bg-primary hover:bg-primary/90 flex items-center justify-center p-0 shadow-lg"
                  >
                    <div className="w-6 h-6 rounded-full bg-white animate-pulse" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full relative">
              <div id={qrContainerId} className="w-full h-full overflow-hidden [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
              <div className="absolute inset-0 border-[3px] border-dashed border-primary/40 pointer-events-none rounded-xl m-4" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="text-xs border-zinc-800 text-zinc-400 hover:text-white">
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
