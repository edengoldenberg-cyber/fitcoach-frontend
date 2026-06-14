import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Upload, Keyboard, ArrowRight, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function BarcodeScan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('choose'); // 'choose', 'camera', 'image', 'manual', 'result'
  const [loading, setLoading] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Debug info (Admin only)
  const [debugLog, setDebugLog] = useState({
    isSecureContext: window.isSecureContext,
    locationHref: window.location.href,
    userAgent: navigator.userAgent,
    hasMediaDevices: !!navigator.mediaDevices,
    hasBarcodeDetector: 'BarcodeDetector' in window,
    lastCameraError: null,
    lastFileSelected: null,
    lastDecodeError: null,
    lastDetectedBarcode: null,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';
  const returnTo = searchParams.get('returnTo') || 'NutritionLog';

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const addDebugLog = (key, value) => {
    setDebugLog(prev => ({ ...prev, [key]: value }));
  };

  // ============================================
  // MODE 1: CAMERA LIVE
  // ============================================
  const startCamera = async () => {
    setMode('camera');
    setError(null);
    setLoading(true);

    try {
      if (!window.isSecureContext) {
        throw new Error('SECURITY: Not HTTPS - camera requires secure context');
      }

      if (!navigator.mediaDevices) {
        throw new Error('BROWSER: navigator.mediaDevices not available');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      addDebugLog('lastCameraError', null);
      setLoading(false);

      // Start scanning if BarcodeDetector available
      if ('BarcodeDetector' in window) {
        // Start scanning with 10 second timeout
        const scanTimeout = setTimeout(() => {
          setError('⏱️ עברו 10 שניות ולא זוהה ברקוד. נסה צילום או הקלדה ידנית');
          cleanup();
          setMode('choose');
        }, 10000);
        
        streamRef.current.scanTimeout = scanTimeout;
        scanFromCamera();
      } else {
        setError('⚠️ BarcodeDetector לא נתמך בדפדפן. השתמש ב"צלם תמונה" או "הקלד ידנית"');
        addDebugLog('lastCameraError', 'BarcodeDetector not supported');
      }

    } catch (err) {
      console.error('Camera error:', err);
      setLoading(false);
      setError(`❌ שגיאת מצלמה: ${err.name} - ${err.message}`);
      addDebugLog('lastCameraError', `${err.name}: ${err.message}`);
      setMode('choose');
    }
  };

  const scanFromCamera = async () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFromCamera);
      return;
    }

    try {
      const barcodeDetector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);

      const barcodes = await barcodeDetector.detect(canvas);
      
      if (barcodes.length > 0) {
        const barcode = barcodes[0].rawValue;
        addDebugLog('lastDetectedBarcode', barcode);
        handleBarcodeDetected(barcode);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(scanFromCamera);

    } catch (err) {
      console.error('Scan error:', err);
      addDebugLog('lastDecodeError', `${err.name}: ${err.message}`);
      animationFrameRef.current = requestAnimationFrame(scanFromCamera);
    }
  };

  // ============================================
  // MODE 2: IMAGE FILE
  // ============================================
  const handleImageCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setMode('image');
      setError(null);
      setLoading(true);
      
      addDebugLog('lastFileSelected', `${file.type} (${(file.size / 1024).toFixed(1)} KB)`);

      // Preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // Decode with timeout (6 seconds for image)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT: 6 seconds exceeded')), 6000)
      );

      const decodePromise = (async () => {
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
          });
          const bitmap = await createImageBitmap(file);
          const barcodes = await barcodeDetector.detect(bitmap);
          
          if (barcodes.length === 0) {
            throw new Error('NO_BARCODE: No barcode found in image');
          }
          
          return barcodes[0].rawValue;
        } else {
          throw new Error('NO_DETECTOR: BarcodeDetector not available');
        }
      })();

      const barcode = await Promise.race([decodePromise, timeoutPromise]);
      
      addDebugLog('lastDecodeError', null);
      handleBarcodeDetected(barcode);

    } catch (err) {
      setLoading(false);
      console.error('Image decode error:', err);
      
      let userMessage = '❌ לא זוהה ברקוד בתמונה';
      
      if (err.message.includes('TIMEOUT')) {
        userMessage = '⏱️ חלפו 6 שניות ולא זוהה ברקוד. נסה תמונה ברורה יותר או הקלד ידנית';
      } else if (err.message.includes('NO_BARCODE')) {
        userMessage = '🔍 לא נמצא ברקוד בתמונה. נסה תמונה ברורה יותר';
      } else if (err.message.includes('NO_DETECTOR')) {
        userMessage = '⚠️ הדפדפן לא תומך בפענוח ברקודים.';
      }
      
      setError(userMessage);
      addDebugLog('lastDecodeError', `${err.name}: ${err.message}`);
    }

    e.target.value = '';
  };

  // ============================================
  // BARCODE DETECTED
  // ============================================
  const handleBarcodeDetected = (barcode) => {
    // Clear timeout if exists
    if (streamRef.current?.scanTimeout) {
      clearTimeout(streamRef.current.scanTimeout);
    }
    
    cleanup();
    
    if (!barcode || barcode.length < 8) {
      setError('❌ ברקוד לא תקין (פחות מ-8 ספרות)');
      setMode('choose');
      return;
    }

    setDetectedBarcode(barcode);
    addDebugLog('lastDetectedBarcode', barcode);
    setMode('result');
    setLoading(false);
  };

  // ============================================
  // MANUAL INPUT
  // ============================================
  const handleManualSubmit = () => {
    if (manualBarcode.length < 8) {
      setError('❌ ברקוד חייב להיות לפחות 8 ספרות');
      return;
    }
    handleBarcodeDetected(manualBarcode);
  };

  // ============================================
  // CONTINUE TO PRODUCT SEARCH
  // ============================================
  const continueToProductSearch = () => {
    navigate(createPageUrl(returnTo) + `?barcode=${detectedBarcode}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">סריקת ברקוד מינימלי</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-slate-800"
          >
            ביטול
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-24">
        
        {/* MODE: CHOOSE */}
        {mode === 'choose' && (
          <div className="space-y-4">
            <Card className="p-4 bg-blue-500/10 border-blue-500/30">
              <p className="text-sm text-blue-200">
                <Info className="w-4 h-4 inline mr-1" />
                מסך סריקה מינימלי לאיתור בעיות ב-Chrome
              </p>
            </Card>

            {error && (
              <Card className="p-4 bg-red-500/20 border-red-500">
                <p className="text-sm text-red-200">{error}</p>
              </Card>
            )}

            <div className="space-y-3">
              <Button
                onClick={startCamera}
                className="w-full h-20 text-lg font-medium bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-3"
              >
                <Camera className="w-6 h-6" />
                פתח מצלמה לסריקה
              </Button>

              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 text-lg font-medium bg-purple-600 hover:bg-purple-700 flex items-center justify-center gap-3"
              >
                <Upload className="w-6 h-6" />
                צלם/בחר תמונה
              </Button>

              <Button
                onClick={() => setMode('manual')}
                className="w-full h-20 text-lg font-medium bg-slate-700 hover:bg-slate-600 flex items-center justify-center gap-3"
              >
                <Keyboard className="w-6 h-6" />
                הקלד ברקוד ידנית
              </Button>
            </div>

            {/* LAST RESULT */}
            {detectedBarcode && (
              <Card className="p-4 bg-green-500/10 border-green-500/30">
                <p className="text-xs text-green-300 mb-1">תוצאה אחרונה:</p>
                <p className="text-lg font-bold text-green-400">{detectedBarcode}</p>
              </Card>
            )}

            {/* DEBUG LOG (Admin only) */}
            {isAdmin && (
              <Card className="p-4 bg-slate-900 border-slate-700">
                <h3 className="text-sm font-bold mb-3 text-yellow-400">🛠️ לוג דיבוג (מאמן)</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <span className="text-slate-400">isSecureContext:</span>
                    <span className={debugLog.isSecureContext ? 'text-green-400' : 'text-red-400'}>
                      {debugLog.isSecureContext ? '✓ HTTPS' : '✗ NOT HTTPS'}
                    </span>

                    <span className="text-slate-400">location:</span>
                    <span className="text-slate-300 break-all">{debugLog.locationHref}</span>

                    <span className="text-slate-400">hasMediaDevices:</span>
                    <span className={debugLog.hasMediaDevices ? 'text-green-400' : 'text-red-400'}>
                      {debugLog.hasMediaDevices ? '✓' : '✗'}
                    </span>

                    <span className="text-slate-400">hasBarcodeDetector:</span>
                    <span className={debugLog.hasBarcodeDetector ? 'text-green-400' : 'text-red-400'}>
                      {debugLog.hasBarcodeDetector ? '✓' : '✗'}
                    </span>

                    <span className="text-slate-400">lastCameraError:</span>
                    <span className="text-red-300">{debugLog.lastCameraError || 'אין'}</span>

                    <span className="text-slate-400">lastFileSelected:</span>
                    <span className="text-slate-300">{debugLog.lastFileSelected || 'אין'}</span>

                    <span className="text-slate-400">lastDecodeError:</span>
                    <span className="text-red-300">{debugLog.lastDecodeError || 'אין'}</span>

                    <span className="text-slate-400">lastDetectedBarcode:</span>
                    <span className="text-green-400">{debugLog.lastDetectedBarcode || 'אין'}</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* MODE: CAMERA */}
        {mode === 'camera' && (
          <div className="space-y-4">
            <Card className="p-4 bg-slate-900 border-slate-700 overflow-hidden">
              <div className="aspect-[4/3] bg-black rounded-lg overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  </div>
                )}

                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-white text-sm bg-black/60 inline-block px-4 py-2 rounded-full">
                    {loading ? 'מתחבר למצלמה...' : 'מחפש ברקוד...'}
                  </p>
                </div>
              </div>
            </Card>

            {error && (
              <Card className="p-4 bg-red-500/20 border-red-500">
                <p className="text-sm text-red-200">{error}</p>
              </Card>
            )}

            <Button
              onClick={() => {
                cleanup();
                setMode('choose');
              }}
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10"
            >
              חזור
            </Button>
          </div>
        )}

        {/* MODE: IMAGE */}
        {mode === 'image' && (
          <div className="space-y-4">
            {imagePreview && (
              <Card className="p-4 bg-slate-900 border-slate-700">
                <div className="aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                </div>
              </Card>
            )}

            {loading ? (
              <div className="text-center space-y-3">
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
                <p className="text-lg">מפענח ברקוד...</p>
                <p className="text-sm text-slate-400">(עד 5 שניות)</p>
              </div>
            ) : error ? (
              <Card className="p-4 bg-red-500/20 border-red-500 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    צלם שוב
                  </Button>
                  <Button
                    onClick={() => setMode('manual')}
                    className="flex-1 bg-slate-700 hover:bg-slate-600"
                  >
                    הקלד ידנית
                  </Button>
                </div>
              </Card>
            ) : null}

            {!loading && !error && (
              <Button
                onClick={() => setMode('choose')}
                variant="outline"
                className="w-full border-white/30 text-white hover:bg-white/10"
              >
                חזור
              </Button>
            )}
          </div>
        )}

        {/* MODE: MANUAL */}
        {mode === 'manual' && (
          <div className="space-y-4">
            <Card className="p-4 bg-slate-900 border-slate-700">
              <h3 className="text-lg font-bold mb-4 text-center">הקלדת ברקוד</h3>
              
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
                placeholder="הקלד 8-13 ספרות..."
                className="w-full px-4 py-3 text-xl text-center bg-slate-800 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                autoFocus
                maxLength={13}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && manualBarcode.length >= 8) {
                    handleManualSubmit();
                  }
                }}
              />

              <p className="text-xs text-slate-400 text-center mt-2">
                הברקוד נמצא מתחת למוצר (בדרך כלל 13 ספרות)
              </p>
            </Card>

            {error && (
              <Card className="p-4 bg-red-500/20 border-red-500">
                <p className="text-sm text-red-200">{error}</p>
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => setMode('choose')}
                variant="outline"
                className="flex-1 border-white/30 text-white hover:bg-white/10"
              >
                חזור
              </Button>
              <Button
                onClick={handleManualSubmit}
                disabled={manualBarcode.length < 8}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                חפש
              </Button>
            </div>
          </div>
        )}

        {/* MODE: RESULT */}
        {mode === 'result' && detectedBarcode && (
          <div className="space-y-4">
            <Card className="p-6 bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/50 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
              
              <div>
                <p className="text-sm text-green-300 mb-2">✅ זוהה ברקוד:</p>
                <p className="text-3xl font-bold text-white">{detectedBarcode}</p>
              </div>

              <Button
                onClick={continueToProductSearch}
                className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 gap-2"
              >
                המשך לחיפוש מוצר
                <ArrowRight className="w-5 h-5" />
              </Button>

              <Button
                onClick={() => {
                  setDetectedBarcode(null);
                  setMode('choose');
                }}
                variant="outline"
                className="w-full border-white/30 text-white hover:bg-white/10"
              >
                סריקה חדשה
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageCapture}
        className="hidden"
      />
    </div>
  );
}