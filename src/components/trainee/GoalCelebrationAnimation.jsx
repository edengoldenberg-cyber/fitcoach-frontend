import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Trophy, Droplets, Utensils, Dumbbell, Star } from 'lucide-react';

export default function GoalCelebrationAnimation({ type, show, onComplete }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      
      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Auto hide after 3 seconds
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onComplete?.(), 500);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  const icons = {
    calories: { icon: Utensils, color: '#10b981', text: 'השלמת יעד קלוריות!' },
    water: { icon: Droplets, color: '#3b82f6', text: 'מצוין! השלמת יעד מים!' },
    workout: { icon: Dumbbell, color: '#f97316', text: 'כל הכבוד! סיימת אימון!' },
    perfect_day: { icon: Trophy, color: '#eab308', text: '🎉 יום מושלם!' },
    streak: { icon: Star, color: '#a855f7', text: 'סטריק חדש!' }
  };

  const config = icons[type] || icons.calories;
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={{
              duration: 0.5,
              repeat: 2,
              repeatType: "reverse"
            }}
            className="bg-white rounded-3xl shadow-2xl p-8 text-center"
            style={{ pointerEvents: 'auto' }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="inline-block mb-4"
            >
              <Icon className="w-20 h-20" style={{ color: config.color }} />
            </motion.div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{config.text}</h3>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              <span className="text-6xl">✨</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}