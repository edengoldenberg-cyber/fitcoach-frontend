import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Smartphone } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Check if already installed or dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (dismissed || isStandalone) {
      return;
    }

    // Show prompt after 3 seconds
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    // Listen for beforeinstallprompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Show iOS instructions
      alert('להוספת האפליקציה למסך הבית:\n\n1. לחץ על כפתור השיתוף בדפדפן\n2. גלול למטה ובחר "הוסף למסך הבית"\n3. לחץ "הוסף"');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-11/12 max-w-md" dir="rtl">
      <Card className="p-4 shadow-2xl border-2" style={{ borderColor: '#79DBD6', backgroundColor: '#000000' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#79DBD6' }}>
            <Smartphone className="w-5 h-5 text-black" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white mb-1">רוצה גישה מהירה?</h3>
            <p className="text-sm text-slate-300 mb-3">
              הוסף את FIT COACH PRO למסך הבית 📲
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleInstall}
                style={{ backgroundColor: '#79DBD6', color: '#000000' }}
                className="hover:opacity-90"
              >
                הוסף למסך הבית
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-slate-300 hover:text-white"
              >
                לא עכשיו
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-6 w-6 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}