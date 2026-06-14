import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, Award, Star, Crown, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

const tierColors = {
  bronze: { bg: 'bg-gradient-to-br from-orange-200 to-orange-400', text: 'text-orange-900', icon: Medal },
  silver: { bg: 'bg-gradient-to-br from-slate-200 to-slate-400', text: 'text-slate-900', icon: Award },
  gold: { bg: 'bg-gradient-to-br from-yellow-200 to-yellow-400', text: 'text-yellow-900', icon: Trophy },
  platinum: { bg: 'bg-gradient-to-br from-purple-200 to-purple-400', text: 'text-purple-900', icon: Crown }
};

export default function AchievementsBadge({ achievement, size = 'normal', onClick }) {
  const tierConfig = tierColors[achievement.tier] || tierColors.bronze;
  const Icon = tierConfig.icon;
  const isSmall = size === 'small';

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="cursor-pointer"
    >
      <Card className={`${tierConfig.bg} ${tierConfig.text} border-0 shadow-lg overflow-hidden relative ${isSmall ? 'p-3' : 'p-4'}`}>
        <div className="absolute top-0 right-0 w-20 h-20 bg-white/20 rounded-full -mr-10 -mt-10" />
        <div className="relative">
          <div className="flex items-start gap-3">
            <div className={`${isSmall ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-white/30 flex items-center justify-center`}>
              <Icon className={isSmall ? 'w-5 h-5' : 'w-6 h-6'} />
            </div>
            <div className="flex-1">
              <h4 className={`font-bold ${isSmall ? 'text-sm' : 'text-base'}`}>{achievement.title}</h4>
              {!isSmall && (
                <p className="text-xs opacity-90 mt-1">{achievement.description}</p>
              )}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-2xl">{achievement.icon}</span>
                <span className="text-xs opacity-75">
                  {new Date(achievement.earned_at).toLocaleDateString('he-IL')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}