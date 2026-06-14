import React from 'react';
import { Card } from "@/components/ui/card";

export default function StatCard({ icon: Icon, label, value, target, unit, color = "emerald" }) {
  const progress = target ? Math.min((value / target) * 100, 100) : 0;
  
  const colorClasses = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    orange: "bg-orange-50 text-orange-600 border-orange-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
  };

  return (
    <Card className={`p-4 border ${colorClasses[color]} transition-all hover:shadow-md`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`p-2 rounded-xl bg-white/50`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium opacity-80">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold">{value}</span>
            {target && <span className="text-sm opacity-70">/ {target}</span>}
            {unit && <span className="text-xs opacity-60">{unit}</span>}
          </div>
        </div>
      </div>
      {target && (
        <div className="mt-3 h-1.5 bg-white/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-current rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Card>
  );
}