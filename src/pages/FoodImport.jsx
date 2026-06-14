import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, CheckCircle, AlertTriangle, Package, Database, ShieldCheck, Trash2 } from 'lucide-react';

export default function FoodImport() {
  const [targetCount, setTargetCount] = useState('1000');
  const [activeJobId, setActiveJobId] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: stats } = useQuery({
    queryKey: ['foodItemsStats'],
    queryFn: async () => {
      const items = await base44.entities.FoodItem.list();
      const israelItems = items.filter(i => i.country_israel);
      const barcode729 = items.filter(i => i.is_barcode_729);
      return {
        total: items.length,
        israel: israelItems.length,
        barcode729: barcode729.length
      };
    },
    refetchInterval: 5000
  });

  const { data: activeJob, refetch: refetchJob } = useQuery({
    queryKey: ['activeImportJob', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return null;
      return await base44.entities.ImportJob.get(activeJobId);
    },
    enabled: !!activeJobId,
    refetchInterval: (data) => {
      if (!data || data.status === 'running') return 2000;
      return false;
    }
  });

  const { data: recentJobs } = useQuery({
    queryKey: ['recentImportJobs'],
    queryFn: () => base44.entities.ImportJob.list('-created_date', 5),
  });

  const { data: qualityCheck, refetch: refetchQuality } = useQuery({
    queryKey: ['foodQualityCheck'],
    queryFn: async () => {
      const response = await base44.functions.invoke('checkFoodQuality', { action: 'check' });
      return response.data;
    },
  });

  const cleanMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('checkFoodQuality', { action: 'clean' });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodQualityCheck'] });
      queryClient.invalidateQueries({ queryKey: ['foodItemsStats'] });
    }
  });

  const importMutation = useMutation({
    mutationFn: async (target) => {
      // Create job
      const job = await base44.entities.ImportJob.create({
        status: 'running',
        target_count: parseInt(target),
        imported_count: 0,
        updated_count: 0,
        skipped_count: 0,
        current_page: 1,
        started_at: new Date().toISOString()
      });

      setActiveJobId(job.id);

      // Start import
      const response = await base44.functions.invoke('importIsraeliFoods', {
        targetCount: parseInt(target),
        jobId: job.id
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItemsStats'] });
      queryClient.invalidateQueries({ queryKey: ['recentImportJobs'] });
    },
    onError: (error) => {
      console.error('Import error:', error);
    }
  });

  const handleImport = () => {
    importMutation.mutate(targetCount);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto p-6" dir="rtl">
        <Card>
          <CardHeader>
            <CardTitle>אין הרשאה</CardTitle>
            <CardDescription>רק מאמנים יכולים לגשת לעמוד זה</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">ייבוא מוצרים ישראליים</h1>
        <p className="text-slate-600 text-sm">ייבוא אוטומטי ממאגר Open Food Facts</p>
      </div>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            סטטיסטיקות מאגר
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-3xl font-bold text-blue-600">{stats?.total || 0}</p>
              <p className="text-sm text-slate-600 mt-1">סה״כ מוצרים</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">{stats?.israel || 0}</p>
              <p className="text-sm text-slate-600 mt-1">מוצרים ישראליים</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-3xl font-bold text-purple-600">{stats?.barcode729 || 0}</p>
              <p className="text-sm text-slate-600 mt-1">ברקוד 729</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            ייבוא חדש
          </CardTitle>
          <CardDescription>
            ייבוא מוצרים ישראליים מתוך Open Food Facts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">יעד מוצרים</label>
            <Select value={targetCount} onValueChange={setTargetCount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000 מוצרים</SelectItem>
                <SelectItem value="3000">3,000 מוצרים</SelectItem>
                <SelectItem value="5000">5,000 מוצרים</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {activeJob?.status === 'running' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <p className="font-medium text-blue-800">ייבוא מתבצע...</p>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p>עמוד נוכחי: {activeJob.current_page}</p>
                <p>יובאו: {activeJob.imported_count} | עודכנו: {activeJob.updated_count} | דולגו: {activeJob.skipped_count}</p>
                <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ 
                      width: `${Math.min(100, ((activeJob.imported_count + activeJob.updated_count) / activeJob.target_count) * 100)}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeJob?.status === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-medium text-green-800">הייבוא הושלם בהצלחה!</p>
              </div>
              <div className="text-sm text-green-700 space-y-1">
                <p>מוצרים חדשים: {activeJob.imported_count}</p>
                <p>מוצרים שעודכנו: {activeJob.updated_count}</p>
                <p>מוצרים שדולגו: {activeJob.skipped_count}</p>
              </div>
            </div>
          )}

          {activeJob?.status === 'failed' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="font-medium text-red-800">הייבוא נכשל</p>
              </div>
              <p className="text-sm text-red-700">{activeJob.last_error}</p>
            </div>
          )}

          <Button 
            onClick={handleImport}
            disabled={importMutation.isPending || activeJob?.status === 'running'}
            className="w-full"
            style={{ backgroundColor: '#79DBD6' }}
          >
            {importMutation.isPending || activeJob?.status === 'running' ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                מייבא...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 ml-2" />
                התחל ייבוא
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Quality Check */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            בקרת איכות מאגר
          </CardTitle>
          <CardDescription>
            בדיקת שלמות ערכים תזונתיים
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qualityCheck && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-600">{qualityCheck.valid}</p>
                  <p className="text-sm text-slate-600 mt-1">מוצרים תקינים</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-600">{qualityCheck.invalid}</p>
                  <p className="text-sm text-slate-600 mt-1">חסרים ערכים</p>
                </div>
              </div>

              {qualityCheck.invalid > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 mb-3">
                    נמצאו {qualityCheck.invalid} מוצרים עם ערכים חסרים שלא יוצגו בחיפוש
                  </p>
                  <Button 
                    onClick={() => cleanMutation.mutate()}
                    disabled={cleanMutation.isPending}
                    variant="destructive"
                    size="sm"
                    className="w-full"
                  >
                    {cleanMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        מנקה...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 ml-2" />
                        נקה מוצרים חסרים
                      </>
                    )}
                  </Button>
                </div>
              )}

              {qualityCheck.invalid === 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">כל המוצרים במאגר תקינים!</p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            ייבואים אחרונים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs && recentJobs.length > 0 ? (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div key={job.id} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {job.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                      {job.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-600" />}
                      {job.status === 'running' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                      <span className="text-sm font-medium text-slate-800">
                        יעד: {job.target_count.toLocaleString()} מוצרים
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      יובאו: {job.imported_count} | עודכנו: {job.updated_count} | דולגו: {job.skipped_count}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(job.created_date).toLocaleString('he-IL')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">אין ייבואים קודמים</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}