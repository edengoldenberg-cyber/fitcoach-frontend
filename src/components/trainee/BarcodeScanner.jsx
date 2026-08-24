import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { Loader2, X, Upload, KeyboardIcon, CheckCircle2, AlertCircle, Camera, Flashlight, FlashlightOff, ChevronDown, ChevronUp, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addLog, getLogs, clearLogs, exportLogsAsText } from '@/components/shared/diagnostics/logger';
import { analyzeBarcodeIssue } from '@/components/shared/barcodeDiagnostics';
import { batchUpdateNutritionMemory, normalizeFoodName, saveAIFoodCorrection } from '@/components/trainee/nutritionLearning';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function BarcodeScanner({ open, onClose, traineeEmail, selectedDate }) {
  const scannerRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastScannedRef = useRef({ barcode: null, timestamp: 0 });
  const [scannedOnce, setScannedOnce] = useState(false);
  
  const [mode, setMode] = useState('choose'); // 'choose','camera','image','manual','result','learn-product','confirm-product','debug'
  const [loading, setLoading] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [productData, setProductData] = useState(null);
  const [productSource, setProductSource] = useState(null); // 'fitcoach_db' | 'openfoodfacts' | null
  // Product learning flow state
  const [learnStep, setLearnStep] = useState('choose'); // 'choose' | 'extracting' | 'manual-entry'
  const [confirmProduct, setConfirmProduct] = useState(null); // product data to confirm before saving
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState('מחפש ברקוד...');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // Debug info for admin
  const [debugInfo, setDebugInfo] = useState({
    userAgent: navigator.userAgent,
    isSecureContext: window.isSecureContext,
    cameraOpened: false,
    decodeMode: null,
    lastDecodeError: null,
    lastDetectedBarcode: null,
    barcodeDetectorSupported: 'BarcodeDetector' in window,
    scannerType: 'html5-qrcode'
  });
  
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: personalFoods = [] } = useQuery({
    queryKey: ['barcodePersonalFoods', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee.id, visibility: 'personal', active: true }),
    enabled: !!trainee?.id && open,
    staleTime: 60_000,
  });

  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const isAdmin = user?.role === 'admin';
  const isCoach = (coachTrainees && coachTrainees.length > 0) || user?.role === 'admin';
  const showDebug = isAdmin || isCoach;

  useEffect(() => {
    if (open) {
      addLog('info', 'barcode', 'barcode_screen_loaded', {
        ua: navigator.userAgent,
        https: window.location.protocol,
        platform: navigator.platform,
      });
      
      setMode('choose');
      setError(null);
      setScannedBarcode(null);
      setProductData(null);
      setProductSource(null);
      setLearnStep('choose');
      setConfirmProduct(null);
      setManualBarcode('');
      setImagePreview(null);
      setCameraActive(false);
      setScannedOnce(false);
      setDebugInfo(prev => ({
        ...prev,
        cameraOpened: false,
        decodeMode: null,
        lastDecodeError: null,
        lastDetectedBarcode: null
      }));
    } else {
      cleanup();
    }
  }, [open]);

  const cleanup = async () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    
    if (scannerRef.current) {
      try {
        const isScanning = scannerRef.current.getState() === 2; // SCANNING state
        if (isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.error('[BarcodeScanner] Cleanup error:', err);
      }
      scannerRef.current = null;
    }
    
    setCameraActive(false);
    setScannedOnce(false);
  };

  // סריקה חיה מהמצלמה
  const startCameraScan = async () => {
    try {
      addLog('info', 'barcode', 'request camera permission');
      
      // בדיקת תמיכה ב-BarcodeDetector
      const supported = 'BarcodeDetector' in window;
      addLog('info', 'barcode', 'BarcodeDetector support', { supported });
      
      setMode('camera');
      setError(null);
      setLoading(true);
      setScannedOnce(false);
      setDebugInfo(prev => ({ ...prev, decodeMode: 'live', cameraOpened: false }));

      // יצירת scanner עם html5-qrcode
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("barcode-reader");
      }

      const config = {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        formatsToSupport: [
          Html5Qrcode.SUPPORTED_FORMATS.EAN_13,
          Html5Qrcode.SUPPORTED_FORMATS.EAN_8,
          Html5Qrcode.SUPPORTED_FORMATS.UPC_A,
          Html5Qrcode.SUPPORTED_FORMATS.UPC_E,
          Html5Qrcode.SUPPORTED_FORMATS.CODE_128,
          Html5Qrcode.SUPPORTED_FORMATS.CODE_39,
        ],
      };

      setScanStatus('מחפש ברקוד...');
      addLog('info', 'barcode', 'scan started', { mode: 'live' });

      // התחל סריקה
      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          // Anti-duplicates: התעלם מברקוד זהה בתוך 5 שניות
          const now = Date.now();
          if (
            lastScannedRef.current.barcode === decodedText &&
            now - lastScannedRef.current.timestamp < 5000
          ) {
            console.log('[BarcodeScanner] Duplicate barcode ignored:', decodedText);
            return;
          }
          
          // הפסק סריקה אחרי זיהוי ראשון
          if (scannedOnce) return;
          setScannedOnce(true);
          
          // עדכן timestamp
          lastScannedRef.current = { barcode: decodedText, timestamp: now };
          
          console.log("BARCODE:", decodedText);
          addLog('success', 'barcode', 'scan_success', { 
            barcode: decodedText
          });
          
          setScanStatus('ברקוד זוהה ✅');
          
          if (scanTimeoutRef.current) {
            clearTimeout(scanTimeoutRef.current);
            scanTimeoutRef.current = null;
          }
          
          setCameraActive(false);
          setDebugInfo(prev => ({ ...prev, lastDetectedBarcode: decodedText }));
          
          // הפסק סריקה מיידית
          await scannerRef.current.stop();
          
          handleBarcodeDetected(decodedText);
        },
        (errorMessage) => {
          // שגיאות סריקה שוטפות - מתעלמים
        }
      );

      // בדוק אם פנס נתמך
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const capabilities = await scannerRef.current.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            setTorchSupported(true);
          }
        }
      } catch (err) {
        console.log('[BarcodeScanner] Torch not supported:', err);
      }

      setCameraActive(true);
      setPermissionGranted(true);
      setDebugInfo(prev => ({ ...prev, cameraOpened: true }));
      setLoading(false);
      
      addLog('success', 'barcode', 'camera stream active', {
        trackSettings: 'available'
      });

      // Timeout של 30 שניות
      scanTimeoutRef.current = setTimeout(async () => {
        await cleanup();
        setError('⏱️ לא הצלחנו לזהות ברקוד תוך 30 שניות.\nנסה/י: תאורה טובה יותר, התקרבות למוצר, או ייצוב הידיים.');
        setMode('choose');
        setDebugInfo(prev => ({ ...prev, lastDecodeError: 'timeout' }));
      }, 30000);

    } catch (err) {
      setLoading(false);
      setCameraActive(false);
      setDebugInfo(prev => ({ ...prev, lastDecodeError: err.message }));
      
      addLog('error', 'barcode', 'camera_failed', {
        errorMessage: err.message
      });
      
      if (err.name === 'NotAllowedError') {
        setError('❌ גישה למצלמה נדחתה.\n\nאנא אפשר/י גישה למצלמה בהגדרות הדפדפן.');
        setMode('permission-denied');
      } else if (err.name === 'NotFoundError') {
        setError('❌ לא נמצאה מצלמה במכשיר.\n\nנסה/י הזנה ידנית או סריקה מתמונה.');
        setMode('choose');
      } else {
        setError('❌ שגיאה בטעינת הסורק.\n\nנסה/י הזנה ידנית או סריקה מתמונה.');
        setMode('choose');
      }
    }
  };

  // סריקה מתמונה — if in learn-product mode, calls AI for label extraction instead of barcode decode
  const handleImageCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── LEARN-PRODUCT PATH: extract nutrition label via AI ───────────────────
    if (mode === 'learn-product' || learnStep === 'extracting') {
      setMode('learn-product');
      setLearnStep('extracting');
      try {
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload = ev => res(ev.target.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        // Call meal photo analysis — the updated prompt has label-priority built in
        const aiRes = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
          meal_text: `תווית תזונה של מוצר ארוז (ברקוד: ${scannedBarcode || 'לא ידוע'})`,
          image_url: base64,
        });
        const items = aiRes?.data?.items || aiRes?.items || [];
        const first = items[0];
        if (first && first.calories > 0) {
          const grams = first.amount || 100;
          setConfirmProduct({
            barcode:         scannedBarcode || '',
            name:            first.name || '',
            brand:           '',
            kcal_per_100:    grams > 0 ? Math.round((first.calories / grams) * 100) : '',
            protein_per_100: grams > 0 ? Math.round(((first.protein  || 0) / grams) * 1000) / 10 : '',
            carbs_per_100:   grams > 0 ? Math.round(((first.carbs    || 0) / grams) * 1000) / 10 : '',
            fat_per_100:     grams > 0 ? Math.round(((first.fat      || 0) / grams) * 1000) / 10 : '',
            serving_size_g:  grams !== 100 ? grams : '',
          });
          setMode('confirm-product');
        } else {
          setLearnStep('failed');
        }
      } catch (aiErr) {
        console.error('[BarcodeScanner] Label AI error:', aiErr);
        setLearnStep('failed');
      }
      e.target.value = '';
      return;
    }

    try {
      addLog('info', 'barcode', 'image capture started', { fileSize: file.size, fileType: file.type });

      setMode('image');
      setError(null);
      setLoading(true);
      setDebugInfo(prev => ({ ...prev, decodeMode: 'image' }));

      // הצגת preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // יצירת scanner אם לא קיים
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("barcode-reader-image");
      }

      // Timeout של 6 שניות
      const timeoutPromise = new Promise((_, reject) => {
        scanTimeoutRef.current = setTimeout(() => reject(new Error('Timeout')), 6000);
      });

      const decodePromise = scannerRef.current.scanFile(file, true);

      const barcode = await Promise.race([decodePromise, timeoutPromise]);
      
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      console.log("BARCODE:", barcode);
      addLog('success', 'barcode', 'scan_success', { barcode });
      setLoading(false);
      setDebugInfo(prev => ({ ...prev, lastDetectedBarcode: barcode }));
      handleBarcodeDetected(barcode);

    } catch (err) {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      setLoading(false);
      setDebugInfo(prev => ({ ...prev, lastDecodeError: err.message }));
      
      addLog('error', 'barcode', 'scan_fail', {
        reason: err.message === 'Timeout' ? 'timeout' : 'decode_failed'
      });
      
      if (err.message === 'Timeout') {
        setError('⏱️ לא הצלחנו לפענח ברקוד מהתמונה תוך 6 שניות.');
      } else {
        setError('❌ לא זוהה ברקוד בתמונה. ודא/י שהברקוד ברור ומואר היטב.');
      }
    }

    e.target.value = '';
  };

  // זוהה ברקוד
  const handleBarcodeDetected = async (barcode) => {
    // ניקוי - רק מספרים
    const cleanBarcode = barcode.replace(/\D/g, '');
    
    if (!cleanBarcode || cleanBarcode.length < 8) {
      setError('ברקוד לא תקין (חייב 8-13 ספרות)');
      setMode('choose');
      return;
    }

    setScannedBarcode(cleanBarcode);
    setMode('result-preview'); // מצב ביניים להצגת הברקוד שזוהה
    setDebugInfo(prev => ({ ...prev, lastDetectedBarcode: cleanBarcode }));
    
    await searchProduct(cleanBarcode);
  };

  // חיפוש מוצר — uses lookupBarcode (FitCoach DB first, then OpenFoodFacts)
  const searchProduct = async (barcode) => {
    setLoading(true);
    setError(null);
    addLog('info', 'barcode', 'search product', { barcode });

    try {
      const result = await base44.functions.invoke('lookupBarcode', { barcode });
      const { product, source } = result?.data || {};

      if (product && product.kcal_per_100 > 0) {
        addLog('success', 'barcode', 'product_found', { productName: product.name, source });
        setProductData(product);
        setProductSource(source);
        setMode('result');
      } else {
        addLog('warn', 'barcode', 'product not found', { barcode });
        setMode('not-found');
      }
    } catch (err) {
      console.error('[BarcodeScanner] Search error:', err);
      setError(`שגיאה בחיפוש מוצר:\n${err.message || 'שגיאה לא ידועה'}`);
      setMode('choose');
      setDebugInfo(prev => ({ ...prev, lastDecodeError: err.message }));
    } finally {
      setLoading(false);
    }
  };

  // הוספת מוצר — productData now carries kcal_per_100 / protein_per_100 etc. directly
  const addProductToMeal = async (overrideGrams) => {
    if (!productData || !traineeEmail) return;

    try {
      setLoading(true);

      // productData from lookupBarcode already has per-100g values
      const per100Kcal    = Number(productData.kcal_per_100)    || 0;
      const per100Protein = Number(productData.protein_per_100) || 0;
      const per100Carbs   = Number(productData.carbs_per_100)   || 0;
      const per100Fat     = Number(productData.fat_per_100)     || 0;

      const foodName = productData.name;

      const grams = overrideGrams || productData.serving_size_g || 100;
      const mealData = {
        trainee_id:          trainee?.id,
        user_id:             user?.id,
        trainee_email:       traineeEmail,
        date:                selectedDate || new Date().toISOString().split('T')[0],
        meal_type:           'snack',
        food_name:           foodName,
        food_item_id:        productData.food_item_id || null,
        food_database_scope: productSource === 'fitcoach_db' ? 'global' : 'external',
        learning_event_type: 'barcode',
        quantity:            grams,
        unit:                'gram',
        grams_equivalent:    grams,
        grams_final:         grams,
        calories:  Math.round((per100Kcal    / 100) * grams),
        protein:   Math.round(((per100Protein / 100) * grams) * 10) / 10,
        carbs:     Math.round(((per100Carbs   / 100) * grams) * 10) / 10,
        fat:       Math.round(((per100Fat     / 100) * grams) * 10) / 10,
        per100_kcal:    per100Kcal,
        per100_protein: per100Protein,
        per100_carbs:   per100Carbs,
        per100_fat:     per100Fat,
      };

      console.log('[BarcodeScanner] Creating meal entry:', mealData);
      const result = await base44.entities.MealEntry.create(mealData);
      console.log('[BarcodeScanner] Meal entry created:', result?.id);

      // Update TraineeNutritionProfile so barcode meals count toward total_meals_logged,
      // average_calories_per_meal, and meal_timing_habits — same as NutritionLog-routed saves.
      if (trainee) {
        batchUpdateNutritionMemory({ trainee, meals: [mealData] }).catch(err =>
          console.warn('[NON-FATAL] barcode meal profile flush failed — MealEntry already committed.', err)
        );
      }

      // Learning write: upsert UserFoodItem so future scans/analyses recognise this food.
      // isManualCorrection=false means the canonical lock inside saveAIFoodCorrection fires:
      // existing nutrition values are never overwritten — only usage_count is bumped.
      // Fire-and-forget: a learning failure must not prevent the meal from being saved.
      if (trainee) {
        saveAIFoodCorrection({
          user,
          trainee,
          originalItem: { name: foodName },
          correctedMeal: {
            food_name:       foodName,
            meal_type:       'snack',
            quantity:        grams,
            unit:            'gram',
            grams_equivalent: grams,
            grams_final:     grams,
            corrected_grams: grams,
            calories:  mealData.calories,
            protein:   mealData.protein,
            carbs:     mealData.carbs,
            fat:       mealData.fat,
            original_ai_text: `barcode:${productData.barcode}`,
          },
          imageContext: '',
          notes: `barcode:${productData.barcode}`,
          isManualCorrection: false,
        }).catch(err => console.warn('[BarcodeScanner] Learning write failed (non-fatal):', err?.message));
      }

      queryClient.invalidateQueries({ queryKey: ['meals'] });
      onClose();
    } catch (err) {
      console.error('[BarcodeScanner] Error adding product:', err);
      setError(`שגיאה בהוספת מוצר: ${err.message || 'שגיאה לא ידועה'}`);
      setLoading(false);
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !torchSupported) return;
    
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchEnabled }]
      });
      setTorchEnabled(!torchEnabled);
    } catch (err) {
      console.error('[BarcodeScanner] Torch toggle error:', err);
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-screen h-screen max-w-full max-h-full p-0 m-0 rounded-none flex flex-col bg-slate-950">
        
        {/* HEADER */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center">
          <h2 className="text-white font-bold text-lg">סריקת ברקוד</h2>
          <button
            onClick={handleClose}
            className="bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODE: CHOOSE */}
        {mode === 'choose' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
            {error && (
              <div className="w-full max-w-sm p-4 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-100 whitespace-pre-line">
                {error}
              </div>
            )}

            <div className="w-full space-y-3 max-w-sm">
              <Button
                onClick={() => {
                  addLog('info', 'barcode', 'open_camera_clicked', {});
                  startCameraScan();
                }}
                className="w-full h-16 bg-green-600 hover:bg-green-700 text-white text-lg font-medium gap-3"
              >
                <Camera className="w-6 h-6" />
                📹 סריקה חיה
              </Button>

              <Button
                onClick={() => {
                  addLog('info', 'barcode', 'image_upload_clicked', {});
                  fileInputRef.current?.click();
                }}
                className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white text-lg font-medium gap-3"
              >
                <Upload className="w-6 h-6" />
                📷 סריקה מתמונה
              </Button>

              <Button
                onClick={() => {
                  addLog('info', 'barcode', 'manual_mode_clicked', {});
                  setMode('manual');
                }}
                className="w-full h-16 bg-purple-600 hover:bg-purple-700 text-white text-lg font-medium gap-3"
              >
                <KeyboardIcon className="w-6 h-6" />
                הקלדה ידנית
              </Button>
            </div>

            {/* Debug Panel (Admin/Coach only) */}
            {showDebug && (() => {
              const allLogs = getLogs();
              const barcodeLogs = allLogs.filter(l => l.category === 'barcode');
              const lastLog = barcodeLogs[barcodeLogs.length - 1];
              const lastError = barcodeLogs.filter(l => l.level === 'error').pop();
              
              return (
                <div className="w-full max-w-sm mt-4">
                  <Accordion type="single" collapsible className="bg-slate-900/50 rounded-lg">
                    <AccordionItem value="debug" className="border-none">
                      <AccordionTrigger className="px-4 py-3 text-white/80 hover:text-white text-sm">
                        🔧 Debug Info (Barcode)
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-3">
                        {/* מדדים ראשיים */}
                        <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">totalLogs:</span>
                            <span className="text-white font-bold">{barcodeLogs.length}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">lastLogEvent:</span>
                            <span className="text-blue-400 font-mono text-[10px]">
                              {lastLog?.action || 'none'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">cameraPermission:</span>
                            <span className={permissionGranted ? 'text-green-400' : 'text-orange-400'}>
                              {permissionGranted ? 'granted' : 'prompt'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">getUserMediaSupported:</span>
                            <span className="text-green-400">
                              {navigator.mediaDevices ? 'true' : 'false'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">barcodeDetectorSupported:</span>
                            <span className={debugInfo.barcodeDetectorSupported ? 'text-green-400' : 'text-orange-400'}>
                              {debugInfo.barcodeDetectorSupported ? 'true' : 'false'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">lastError:</span>
                            <span className="text-red-400 text-[10px] break-all">
                              {lastError ? lastError.payload?.errorMessage || lastError.payload?.reason || 'error' : 'none'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">lastDetectedBarcode:</span>
                            <span className="text-green-400 font-bold">
                              {debugInfo.lastDetectedBarcode || 'none'}
                            </span>
                          </div>
                        </div>
                        
                        {/* כפתורי בדיקה */}
                        <div className="space-y-2">
                          <div className="text-white/70 text-xs font-bold">כפתורי בדיקה:</div>
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              onClick={() => {
                                addLog('info', 'barcode', 'test_log', { time: new Date().toISOString() });
                                alert('Test Log נוסף! בדוק totalLogs למעלה');
                              }}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-xs"
                            >
                              Test Log
                            </Button>
                            <Button
                              onClick={() => {
                                clearLogs();
                                alert('לוגים נוקו');
                              }}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              Clear Logs
                            </Button>
                            <Button
                              onClick={() => {
                                const report = exportLogsAsText();
                                navigator.clipboard.writeText(report);
                                alert('הדוח הועתק');
                              }}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              Copy Report
                            </Button>
                          </div>
                        </div>
                        
                        <div className="bg-blue-900/30 rounded p-2 text-[10px] text-blue-200 text-center">
                          ✅ Logger פעיל: {barcodeLogs.length} לוגים
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              );
            })()}

            {isAdmin && (
              <button
                onClick={() => {
                  addLog('info', 'barcode', 'debug panel opened');
                  setMode('debug');
                }}
                className="text-xs text-white/50 hover:text-white/80 underline mt-4"
              >
                מידע דיבאג (מאמן)
              </button>
            )}
          </div>
        )}

        {/* MODE: CAMERA */}
        {mode === 'camera' && (
          <div className="flex-1 flex flex-col items-center justify-center relative bg-black">
            {loading ? (
              <div className="text-center space-y-3">
                <Loader2 className="w-12 h-12 text-green-400 animate-spin mx-auto" />
                <p className="text-white">פותח מצלמה...</p>
              </div>
            ) : cameraActive ? (
              <>
                <div id="barcode-reader" className="w-full h-full" />
                
                {/* Overlay כהה עם חלון סריקה */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* רקע כהה */}
                  <div className="absolute inset-0 bg-black/60" />
                  
                  {/* חלון סריקה במרכז */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-[260px] h-[260px] border-2 border-green-400 rounded-lg shadow-lg" />
                  </div>
                </div>
                
                {/* טקסט הדרכה */}
                <div className="absolute top-24 left-0 right-0 text-center pointer-events-none z-20">
                  <p className="text-white text-lg font-bold bg-green-600/90 px-6 py-3 rounded-full inline-block shadow-lg">
                    כוון את הברקוד למרכז
                  </p>
                </div>
                
                {/* חיווי סטטוס */}
                <div className="absolute bottom-32 left-0 right-0 text-center pointer-events-none z-20">
                  <p className="text-white/80 text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
                    {scanStatus}
                  </p>
                </div>
                
                {/* כפתורים */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 z-20 px-4">
                  {torchSupported && (
                    <Button
                      onClick={toggleTorch}
                      variant="outline"
                      size="icon"
                      className="border-white/30 text-white hover:bg-white/10 pointer-events-auto"
                    >
                      {torchEnabled ? (
                        <FlashlightOff className="w-5 h-5" />
                      ) : (
                        <Flashlight className="w-5 h-5" />
                      )}
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => setMode('manual')}
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 pointer-events-auto"
                  >
                    הזנה ידנית
                  </Button>
                  
                  <Button
                    onClick={async () => {
                      await cleanup();
                      setMode('choose');
                    }}
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 pointer-events-auto"
                  >
                    סגור
                  </Button>
                </div>
                
                {/* Scanner Debug (Admin/Coach only) */}
                {showDebug && (
                  <div className="absolute bottom-24 left-4 right-4 bg-black/90 rounded-lg p-3 z-30 text-[10px] font-mono text-white/90 max-h-48 overflow-y-auto pointer-events-none border border-green-400/30">
                    <div className="font-bold text-green-400 mb-2 text-xs">🔧 Scanner Debug (Admin/Coach)</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-white/70">Camera Active:</span>
                        <span className={cameraActive ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                          {cameraActive ? '✓ true' : '✗ false'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">Permission Granted:</span>
                        <span className={permissionGranted ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                          {permissionGranted ? '✓ true' : '✗ false'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">BarcodeDetector Supported:</span>
                        <span className={debugInfo.barcodeDetectorSupported ? 'text-green-400' : 'text-orange-400'}>
                          {debugInfo.barcodeDetectorSupported ? '✓ true' : '✗ false'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">Scanner Type:</span>
                        <span className="text-blue-400 font-bold">{debugInfo.scannerType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/70">Last Detected Barcode:</span>
                        <span className="text-green-400 font-bold">{debugInfo.lastDetectedBarcode || 'none'}</span>
                      </div>
                      {debugInfo.lastDecodeError && (
                        <div className="border-t border-white/20 my-1 pt-1">
                          <div className="text-red-400 text-[9px] break-all">
                            Error: {debugInfo.lastDecodeError}
                          </div>
                        </div>
                      )}
                      <div className="border-t border-white/20 my-1 pt-1">
                        <div className="text-white/60 text-[9px] break-all">
                          UA: {debugInfo.userAgent.substring(0, 80)}...
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* MODE: RESULT PREVIEW (showing detected barcode) */}
        {mode === 'result-preview' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-400" />
            
            <div className="text-center">
              <p className="text-lg font-bold text-green-400 mb-2">✅ ברקוד זוהה</p>
              <p className="text-3xl font-bold text-white">{scannedBarcode}</p>
            </div>
            
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
              <p className="text-white mt-3">מחפש מוצר במאגר...</p>
            </div>
          </div>
        )}

        {/* MODE: IMAGE */}
        {mode === 'image' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <div id="barcode-reader-image" className="hidden" />
            
            {imagePreview && (
              <div className="w-full max-w-sm aspect-video bg-slate-800 rounded-lg overflow-hidden">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}

            {loading ? (
              <div className="text-center space-y-3">
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
                <p className="text-white">מפענח ברקוד מהתמונה...</p>
                <p className="text-white/50 text-xs">(עד 6 שניות)</p>
              </div>
            ) : error ? (
              <div className="text-center space-y-4 max-w-sm">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                <p className="text-red-200 text-sm whitespace-pre-line">{error}</p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    נסה/י שוב
                  </Button>
                  <Button
                    onClick={() => setMode('manual')}
                    variant="outline"
                    className="flex-1 border-white/30 text-white hover:bg-white/10"
                  >
                    הקלד/י ידנית
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* MODE: MANUAL */}
        {mode === 'manual' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <h3 className="text-xl font-bold text-white">הקלדת ברקוד</h3>
            
            <input
              type="text"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
              placeholder="הקלד ברקוד (8-13 ספרות)..."
              className="w-full max-w-sm px-4 py-3 text-center text-xl border-2 border-white/30 rounded-lg bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-blue-400"
              autoFocus
              maxLength={13}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && manualBarcode.length >= 8) {
                  searchProduct(manualBarcode);
                }
              }}
            />

            <p className="text-white/50 text-xs">הברקוד נמצא מתחת למוצר (8-13 ספרות)</p>

            {error && (
              <div className="w-full max-w-sm p-3 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-200 whitespace-pre-line">
                {error}
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-white">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>מחפש מוצר...</span>
              </div>
            )}

            <div className="flex gap-2 w-full max-w-sm">
              <Button
                onClick={() => setMode('choose')}
                variant="outline"
                className="flex-1 border-white/30 text-white hover:bg-white/10"
              >
                חזור
              </Button>
              <Button
                onClick={() => searchProduct(manualBarcode)}
                disabled={manualBarcode.length < 8 || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                חפש
              </Button>
            </div>
          </div>
        )}

        {/* MODE: RESULT */}
        {mode === 'result' && productData && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 overflow-y-auto">
            <CheckCircle2 className="w-12 h-12 text-green-400 flex-shrink-0" />

            <div className="text-center">
              {scannedBarcode && <p className="text-xs text-white/50 mb-1">ברקוד: {scannedBarcode}</p>}
              {productSource && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  productSource === 'fitcoach_db' ? 'bg-green-700/40 text-green-300' : 'bg-blue-700/40 text-blue-300'
                }`}>
                  {productSource === 'fitcoach_db' ? '✓ מאגר FitCoach' : '○ OpenFoodFacts'}
                </span>
              )}
            </div>

            <div className="w-full max-w-md bg-slate-900/50 rounded-xl p-5 border border-white/10 space-y-4">
              <h3 className="font-bold text-xl text-white text-center">{productData.name}</h3>
              {productData.brand && <p className="text-center text-white/50 text-sm">{productData.brand}</p>}

              <div className="text-center text-white/50 text-xs">ל-100 גרם</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <p className="text-white/60 text-xs mb-1">קלוריות</p>
                  <p className="text-green-400 font-bold text-lg">{Math.round(productData.kcal_per_100)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <p className="text-white/60 text-xs mb-1">חלבון</p>
                  <p className="text-blue-400 font-bold text-lg">{Number(productData.protein_per_100).toFixed(1)}ג׳</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <p className="text-white/60 text-xs mb-1">פחמימות</p>
                  <p className="text-orange-400 font-bold text-lg">{Number(productData.carbs_per_100).toFixed(1)}ג׳</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <p className="text-white/60 text-xs mb-1">שומן</p>
                  <p className="text-purple-400 font-bold text-lg">{Number(productData.fat_per_100).toFixed(1)}ג׳</p>
                </div>
              </div>

              {productData.serving_size_g && (
                <div className="text-center text-xs text-white/40">
                  גודל מנה: {productData.serving_size_g}ג׳
                  {' · '}
                  {Math.round((productData.kcal_per_100 / 100) * productData.serving_size_g)} קל׳ למנה
                </div>
              )}
            </div>

            {/* If from external source — offer to save to FitCoach DB */}
            {productSource === 'openfoodfacts' && (
              <p className="text-white/40 text-xs text-center max-w-xs">
                מוצר זה הגיע ממאגר חיצוני. לאחר הוספה, הנתונים יישמרו ב-FitCoach.
              </p>
            )}

            <div className="flex gap-2 w-full max-w-md">
              <Button
                onClick={() => {
                  setMode('choose');
                  setProductData(null);
                  setProductSource(null);
                  setScannedBarcode(null);
                  setImagePreview(null);
                }}
                variant="outline"
                className="flex-1 border-white/30 text-white hover:bg-white/10"
              >
                סריקה חדשה
              </Button>
              <Button
                onClick={() => addProductToMeal()}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {loading ? 'מוסיף...' : 'הוסף מוצר'}
              </Button>
            </div>
          </div>
        )}

        {/* MODE: DEBUG */}
        {mode === 'debug' && isAdmin && (() => {
          const allLogs = getLogs();
          const barcodeLogs = allLogs.filter(l => l.category === 'barcode');
          const analysis = analyzeBarcodeIssue(barcodeLogs);
          
          return (
            <div className="flex-1 flex flex-col p-6 space-y-4 overflow-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">🔍 ניתוח ברקוד (מאמן)</h3>
                <button
                  onClick={() => setMode('choose')}
                  className="text-white/70 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Analysis Result */}
              <div className={`w-full rounded-lg p-4 border-2 ${
                analysis.status === 'SUCCESS' ? 'bg-green-900/30 border-green-500' :
                analysis.status === 'PERMISSION_DENIED' ? 'bg-red-900/30 border-red-500' :
                analysis.status === 'PRODUCT_NOT_FOUND' ? 'bg-yellow-900/30 border-yellow-500' :
                'bg-orange-900/30 border-orange-500'
              }`}>
                <div className="flex items-start gap-3">
                  {analysis.status === 'SUCCESS' ? <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" /> :
                   analysis.status === 'PERMISSION_DENIED' || analysis.status.includes('FAILED') ? <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" /> :
                   <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0" />}
                  
                  <div className="flex-1">
                    <div className="font-bold text-white mb-2">
                      {analysis.status === 'SUCCESS' ? '✅ הכל תקין' :
                       analysis.status === 'NO_LOGS' ? '⚠️ אין לוגים' :
                       '❌ זוהתה בעיה'}
                    </div>
                    
                    {analysis.issue && (
                      <div className="text-white text-sm mb-3">
                        <strong>הבעיה:</strong> {analysis.issue}
                      </div>
                    )}
                    
                    {analysis.recommendations.length > 0 && (
                      <div className="text-white/90 text-sm">
                        <strong className="block mb-1">המלצות:</strong>
                        <ul className="list-disc list-inside space-y-1">
                          {analysis.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-800/50 rounded p-2 text-center">
                  <div className="text-xl font-bold text-white">{analysis.debugInfo.totalLogs || 0}</div>
                  <div className="text-xs text-white/60">לוגים</div>
                </div>
                <div className="bg-red-900/30 rounded p-2 text-center">
                  <div className="text-xl font-bold text-red-400">{analysis.debugInfo.errors || 0}</div>
                  <div className="text-xs text-white/60">שגיאות</div>
                </div>
                <div className="bg-yellow-900/30 rounded p-2 text-center">
                  <div className="text-xl font-bold text-yellow-400">{analysis.debugInfo.warnings || 0}</div>
                  <div className="text-xs text-white/60">אזהרות</div>
                </div>
                <div className="bg-green-900/30 rounded p-2 text-center">
                  <div className="text-xl font-bold text-green-400">{analysis.debugInfo.successes || 0}</div>
                  <div className="text-xs text-white/60">הצלחות</div>
                </div>
              </div>

              {/* Timeline */}
              {analysis.timeline && analysis.timeline.length > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h4 className="text-white font-bold mb-3 text-sm">📋 טיימליין אירועים</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analysis.timeline.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <span className="text-white/50 font-mono">{item.time}</span>
                        <span className={`font-bold ${
                          item.level === 'error' ? 'text-red-400' :
                          item.level === 'warn' ? 'text-yellow-400' :
                          item.level === 'success' ? 'text-green-400' :
                          'text-blue-400'
                        }`}>
                          {item.level === 'error' ? '❌' :
                           item.level === 'warn' ? '⚠️' :
                           item.level === 'success' ? '✅' : 'ℹ️'}
                        </span>
                        <span className="text-white/80 flex-1">{item.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* System Info */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <h4 className="text-white font-bold mb-2 text-sm">🔧 מידע טכני</h4>
                <div className="grid grid-cols-[120px_1fr] gap-2 text-xs font-mono">
                  <span className="text-white/50">BarcodeDetector:</span>
                  <span className={debugInfo.barcodeDetectorSupported ? 'text-green-400' : 'text-orange-400'}>
                    {debugInfo.barcodeDetectorSupported ? 'Supported' : 'Not Supported'}
                  </span>
                  
                  <span className="text-white/50">Scanner Type:</span>
                  <span className="text-blue-400">{debugInfo.scannerType}</span>
                  
                  <span className="text-white/50">HTTPS:</span>
                  <span className={debugInfo.isSecureContext ? 'text-green-400' : 'text-red-400'}>
                    {debugInfo.isSecureContext ? 'Yes' : 'No'}
                  </span>
                  
                  <span className="text-white/50">Browser:</span>
                  <span className="text-white/70 break-all text-[10px]">
                    {debugInfo.userAgent.substring(0, 60)}...
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => {
                    addLog('info', 'barcode', 'test_log', { time: new Date().toISOString() });
                    alert('Test Log נוסף!');
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Test Log
                </Button>
                <Button
                  onClick={() => {
                    clearLogs();
                    alert('לוגים נוקו');
                    setMode('choose');
                  }}
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
                <Button
                  onClick={() => {
                    const report = exportLogsAsText();
                    navigator.clipboard.writeText(report);
                    alert('הדוח הועתק');
                  }}
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>

              <Button
                onClick={() => setMode('choose')}
                className="w-full bg-slate-600 hover:bg-slate-700"
              >
                חזור למסך הראשי
              </Button>
            </div>
          );
        })()}

        {/* MODE: NOT FOUND — product learning entry */}
        {mode === 'not-found' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-5 overflow-y-auto">
            <AlertCircle className="w-14 h-14 text-orange-400 flex-shrink-0" />

            <div className="text-center space-y-2">
              <p className="text-xl font-bold text-white">מוצר חדש — בוא נלמד אותו</p>
              {scannedBarcode && <p className="text-sm text-white/50">ברקוד: {scannedBarcode}</p>}
              <p className="text-white/60 text-sm max-w-xs">
                המוצר לא קיים במאגר. נוכל ללמד את FitCoach את הערכים שלו.
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <Button
                onClick={() => {
                  setLearnStep('extracting');
                  setMode('learn-product');
                  // Trigger label photo capture
                  setTimeout(() => fileInputRef.current?.click(), 100);
                }}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2"
              >
                📷 צלם תווית תזונה
              </Button>

              <Button
                onClick={() => {
                  setLearnStep('manual-entry');
                  setConfirmProduct({
                    barcode: scannedBarcode || '',
                    name: '',
                    brand: '',
                    kcal_per_100: '',
                    protein_per_100: '',
                    carbs_per_100: '',
                    fat_per_100: '',
                    serving_size_g: '',
                  });
                  setMode('confirm-product');
                }}
                className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white font-medium gap-2"
              >
                ✏️ הזן ערכים ידנית
              </Button>
            </div>

            <Button
              onClick={() => { setMode('choose'); setScannedBarcode(null); setError(null); }}
              variant="ghost"
              className="text-white/50 hover:text-white text-sm"
            >
              ביטול
            </Button>
          </div>
        )}

        {/* MODE: LEARN-PRODUCT — scanning label photo for AI extraction */}
        {mode === 'learn-product' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-5">
            {learnStep === 'extracting' ? (
              <>
                <Loader2 className="w-14 h-14 text-blue-400 animate-spin" />
                <p className="text-white font-semibold text-lg">מחלץ ערכי תזונה מהתמונה...</p>
                <p className="text-white/50 text-sm">זה יכול לקחת עד 10 שניות</p>
              </>
            ) : (
              <>
                <AlertCircle className="w-14 h-14 text-red-400" />
                <p className="text-white font-semibold">לא הצלחנו לחלץ ערכים</p>
                <div className="flex gap-2">
                  <Button onClick={() => { setLearnStep('extracting'); setTimeout(() => fileInputRef.current?.click(), 100); }}
                    className="bg-blue-600 hover:bg-blue-700">נסה שוב</Button>
                  <Button onClick={() => {
                    setLearnStep('manual-entry');
                    setConfirmProduct({ barcode: scannedBarcode || '', name: '', brand: '', kcal_per_100: '', protein_per_100: '', carbs_per_100: '', fat_per_100: '', serving_size_g: '' });
                    setMode('confirm-product');
                  }} variant="outline" className="border-white/30 text-white hover:bg-white/10">הזן ידנית</Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* MODE: CONFIRM-PRODUCT — review/edit before saving to DB */}
        {mode === 'confirm-product' && confirmProduct && (
          <div className="flex-1 flex flex-col p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">אישור ושמירת מוצר</h3>
              <button onClick={() => setMode('not-found')} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white/50 text-xs">בדוק/י את הפרטים לפני השמירה. ניתן לערוך.</p>

            {[
              { key: 'name',            label: 'שם מוצר',         type: 'text' },
              { key: 'brand',           label: 'מותג',             type: 'text' },
              { key: 'kcal_per_100',    label: 'קלוריות (100ג׳)', type: 'number' },
              { key: 'protein_per_100', label: 'חלבון (100ג׳)',   type: 'number' },
              { key: 'carbs_per_100',   label: 'פחמימות (100ג׳)', type: 'number' },
              { key: 'fat_per_100',     label: 'שומן (100ג׳)',    type: 'number' },
              { key: 'serving_size_g',  label: 'גודל מנה (ג׳)',   type: 'number' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-white/60 text-xs block mb-1">{label}</label>
                <input
                  type={type}
                  value={confirmProduct[key] ?? ''}
                  onChange={e => setConfirmProduct(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-slate-800 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  placeholder={label}
                />
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => setMode('not-found')}
                variant="outline"
                className="flex-1 border-white/30 text-white hover:bg-white/10"
              >
                ביטול
              </Button>
              <Button
                disabled={!confirmProduct.name || !confirmProduct.kcal_per_100 || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const saveRes = await base44.functions.invoke('saveLearnedProduct', {
                      barcode: confirmProduct.barcode || scannedBarcode,
                      name: confirmProduct.name,
                      brand: confirmProduct.brand,
                      kcal_per_100:    Number(confirmProduct.kcal_per_100),
                      protein_per_100: Number(confirmProduct.protein_per_100) || 0,
                      carbs_per_100:   Number(confirmProduct.carbs_per_100)   || 0,
                      fat_per_100:     Number(confirmProduct.fat_per_100)     || 0,
                      serving_size_g:  confirmProduct.serving_size_g ? Number(confirmProduct.serving_size_g) : null,
                    });
                    if (saveRes?.ok !== false) {
                      // Show as result screen
                      setProductData({
                        food_item_id:    saveRes?.data?.product?.id || null,
                        name:            confirmProduct.name,
                        brand:           confirmProduct.brand || '',
                        barcode:         confirmProduct.barcode || scannedBarcode,
                        kcal_per_100:    Number(confirmProduct.kcal_per_100),
                        protein_per_100: Number(confirmProduct.protein_per_100) || 0,
                        carbs_per_100:   Number(confirmProduct.carbs_per_100)   || 0,
                        fat_per_100:     Number(confirmProduct.fat_per_100)     || 0,
                        serving_size_g:  confirmProduct.serving_size_g ? Number(confirmProduct.serving_size_g) : null,
                      });
                      setProductSource('fitcoach_db');
                      setMode('result');
                    } else {
                      setError(saveRes?.error || 'שגיאה בשמירה');
                    }
                  } catch (err) {
                    setError(err.message || 'שגיאה בשמירה');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'אישור ושמירת מוצר'}
              </Button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        )}

        {/* MODE: PERMISSION DENIED */}
        {mode === 'permission-denied' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <AlertCircle className="w-16 h-16 text-red-400" />
            
            <div className="text-center space-y-3 max-w-md">
              <p className="text-xl font-bold text-white">נדרשת הרשאת מצלמה</p>
              <p className="text-white/70 text-sm whitespace-pre-line">{error}</p>
            </div>

            <div className="w-full max-w-md bg-red-900/20 rounded-lg p-4 border border-red-400/30">
              <p className="text-red-200 text-sm">
                📱 בהגדרות הדפדפן, אפשר גישה למצלמה עבור אתר זה
              </p>
            </div>

            <div className="flex gap-2 w-full max-w-md">
              <Button
                onClick={() => setMode('manual')}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                הזנה ידנית
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-white/30 text-white hover:bg-white/10"
              >
                סגור
              </Button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}