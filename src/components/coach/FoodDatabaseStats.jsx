import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Database, TrendingUp, Upload, Calendar } from 'lucide-react';

export default function FoodDatabaseStats() {
  const { data: stats } = useQuery({
    queryKey: ['systemStats', 'food_database'],
    queryFn: async () => {
      const results = await base44.entities.SystemStats.filter({ stat_key: 'food_database' });
      return results[0] || null;
    },
    refetchInterval: 5000, // רענון כל 5 שניות
  });

  const { data: foodItems = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  // Calculate live category counts
  const categoryCounts = React.useMemo(() => {
    const counts = {};
    foodItems.forEach(item => {
      const cat = item.category || 'אחר';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [foodItems]);

  const totalProducts = foodItems.length;
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <Card className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
        <div className="flex items-center justify-between mb-2">
          <Database className="w-5 h-5 text-teal-600" />
          <span className="text-xs text-teal-600 font-medium">מאגר מזון</span>
        </div>
        <p className="text-3xl font-bold text-teal-800">{totalProducts}</p>
        <p className="text-xs text-teal-600">סה״כ מוצרים</p>
      </Card>

      {topCategories.map(([category, count], idx) => (
        <Card key={category} className="p-4 bg-white border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-slate-500" />
            <span className="text-xs text-slate-500">#{idx + 1}</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{count}</p>
          <p className="text-xs text-slate-600">{category}</p>
        </Card>
      ))}

      {stats?.last_import_time && (
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 md:col-span-4">
          <div className="flex items-center gap-4">
            <Upload className="w-5 h-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">ייבוא אחרון</p>
              <div className="flex gap-4 mt-1 text-xs text-blue-700">
                <span>✅ נוספו: {stats.last_import_count}</span>
                <span>⏭️ כפילויות: {stats.last_import_duplicates}</span>
                <span>❌ נכשלו: {stats.last_import_failed}</span>
                <span className="mr-auto flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(stats.last_import_time).toLocaleString('he-IL')}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}