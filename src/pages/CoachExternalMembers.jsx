import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Users, Upload, Search, Plus, Edit2, Trash2, Wifi, Copy, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function CoachExternalMembers() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTestResult, setShowTestResult] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  
  // Arbox credentials
  const [arboxApiKey, setArboxApiKey] = useState('');
  const [arboxBoxId, setArboxBoxId] = useState('');
  const [connectionVerified, setConnectionVerified] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['externalTrainees', user?.email],
    queryFn: () => base44.entities.ExternalTrainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['integrationLogs', user?.email],
    queryFn: async () => {
      const allLogs = await base44.entities.IntegrationLog.filter({ 
        coach_email: user?.email,
        provider: 'arbox'
      });
      return allLogs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    },
    enabled: !!user?.email,
  });

  const { data: connectionLogs = [] } = useQuery({
    queryKey: ['arboxConnectionLogs', user?.email],
    queryFn: async () => {
      const allLogs = await base44.entities.ArboxConnectionLog.filter({ 
        coach_email: user?.email
      });
      return allLogs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);
    },
    enabled: !!user?.email,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('importFromArbox', { 
        limit: 100, 
        activeOnly: false 
      });
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['externalTrainees'] });
      queryClient.invalidateQueries({ queryKey: ['integrationLogs'] });
      
      if (result.ok) {
        toast.success(result.hint || `✅ יובאו ${result.imported} | עודכנו ${result.updated}`);
      } else {
        toast.error(`❌ ${result.error}\n${result.hint || ''}`);
      }
    },
    onError: (error) => {
      toast.error('שגיאה: ' + error.message);
    }
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('saveArboxCredentials', {
        api_key: arboxApiKey,
        box_id: arboxBoxId
      });
      return response.data;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('✅ פרטי החיבור נשמרו');
        setConnectionVerified(false);
      } else {
        toast.error(result.error || 'שגיאה בשמירה');
      }
    },
    onError: (error) => {
      toast.error('שגיאה: ' + error.message);
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await base44.functions.invoke('testArboxConnection', {});
        clearTimeout(timeoutId);
        return response.data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('פג זמן החיבור (15 שניות). בדוק חיבור לאינטרנט.');
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      setShowTestResult(result);
      queryClient.invalidateQueries({ queryKey: ['integrationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['arboxConnectionLogs'] });
      
      // Always log to ArboxConnectionLog (both success and failure)
      try {
        await base44.entities.ArboxConnectionLog.create({
          coach_email: user.email,
          status: result.ok ? 'success' : 'error',
          status_code: result.status || 0,
          error_code: result.errorCode || '',
          unique_identifier: result.uniqueIdentifier || '',
          endpoint: result.endpoint || '',
          duration_ms: result.durationMs || 0,
          ok: result.ok,
          message: result.hint || result.error || '',
          members_count: result.totalFetched || 0,
          box_id: arboxBoxId || ''
        });
      } catch (logError) {
        console.error('Failed to create connection log:', logError);
      }
      
      if (result.ok) {
        setConnectionVerified(true);
        toast.success(`✅ ${result.hint || 'החיבור תקין'}\n\nStatus: ${result.status}\nEndpoint: ${result.endpoint || '/manage/v2/reports/getLivForCustomer'}`, { duration: 5000 });
      } else {
        setConnectionVerified(false);
        toast.error(`❌ החיבור נכשל\n\nStatus: ${result.status}\nError: ${result.error}\n\n${result.hint || ''}`, { duration: 7000 });
      }
    },
    onError: async (error) => {
      setConnectionVerified(false);
      
      // Log error to ArboxConnectionLog
      try {
        await base44.entities.ArboxConnectionLog.create({
          coach_email: user.email,
          status: 'error',
          status_code: 0,
          error_code: '',
          unique_identifier: '',
          endpoint: '',
          duration_ms: 15000,
          ok: false,
          message: error.message,
          members_count: 0,
          box_id: arboxBoxId || ''
        });
      } catch (logError) {
        console.error('Failed to create error log:', logError);
      }
      
      queryClient.invalidateQueries({ queryKey: ['arboxConnectionLogs'] });
      
      toast.error(`❌ שגיאה: ${error.message}`, { duration: 5000 });
    },
    onSettled: () => {
      // Ensure loading state is cleared in all cases
    }
  });

  const createMemberMutation = useMutation({
    mutationFn: async (data) => {
      if (editingMember) {
        await base44.entities.ExternalTrainee.update(editingMember.id, data);
      } else {
        await base44.entities.ExternalTrainee.create({
          coach_email: user.email,
          source: 'MANUAL',
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['externalTrainees'] });
      toast.success(editingMember ? 'עודכן' : 'נוצר');
      resetForm();
      setShowAddDialog(false);
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (memberId) => base44.entities.ExternalTrainee.delete(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['externalTrainees'] });
      toast.success('נמחק');
    },
  });

  const resetForm = () => {
    setMemberName('');
    setMemberPhone('');
    setEditingMember(null);
  };

  const handleSaveMember = () => {
    if (!memberName.trim() || !memberPhone.trim()) {
      toast.error('שם וטלפון הם חובה');
      return;
    }

    let phoneE164 = memberPhone.replace(/[\s\-()]/g, '');
    if (phoneE164.startsWith('05')) {
      phoneE164 = '+9725' + phoneE164.substring(2);
    } else if (phoneE164.startsWith('972') && !phoneE164.startsWith('+')) {
      phoneE164 = '+' + phoneE164;
    }

    if (!phoneE164.startsWith('+972') || phoneE164.length !== 13) {
      toast.error('טלפון לא תקין. צריך להתחיל ב-05 או +972');
      return;
    }

    createMemberMutation.mutate({
      full_name: memberName,
      phone_e164: phoneE164
    });
  };

  const copyLogToClipboard = (log) => {
    const debugData = {
      timestamp: log.created_date,
      action: log.action,
      status: log.status,
      ok: log.ok,
      error: log.error,
      errorCode: log.errorCode,
      uniqueIdentifier: log.uniqueIdentifier,
      hint: log.hint,
      endpoint: log.endpoint,
      durationMs: log.durationMs,
      debugPayload: log.debugPayload,
      fetched: log.fetched,
      imported: log.imported,
      updated: log.updated
    };
    navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
    toast.success('הועתק ללוח');
  };

  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.phone_e164?.includes(searchQuery)
  );

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">טוען...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="title-large mb-2">מתאמנים חיצוניים</h1>
          <p className="body-text text-slate-600">ייבוא מארבוקס וניהול מתאמנים</p>
        </div>

        {/* Arbox Connection Card */}
        <Card className="card-premium mb-6 border-2 border-purple-200 bg-purple-50">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Wifi className="w-6 h-6 text-purple-600" />
              חיבור לארבוקס
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="small-text font-semibold block mb-2">ARBOX_API_KEY *</label>
                <Input
                  type="password"
                  value={arboxApiKey}
                  onChange={(e) => {
                    setArboxApiKey(e.target.value);
                    setConnectionVerified(false);
                  }}
                  className="input-premium font-mono"
                  placeholder="מפתח API מארבוקס"
                />
              </div>

              <div>
                <label className="small-text font-semibold block mb-2">ARBOX_BOX_ID *</label>
                <Input
                  type="text"
                  value={arboxBoxId}
                  onChange={(e) => {
                    setArboxBoxId(e.target.value);
                    setConnectionVerified(false);
                  }}
                  className="input-premium font-mono"
                  placeholder="מספר Box ID"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => saveCredentialsMutation.mutate()}
                  disabled={!arboxApiKey || !arboxBoxId || saveCredentialsMutation.isPending}
                  className="btn-primary"
                >
                  {saveCredentialsMutation.isPending ? '...שומר' : 'שמור פרטי חיבור'}
                </Button>
                
                <Button
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={testConnectionMutation.isPending}
                  variant="outline"
                  className="border-2 border-blue-300 relative"
                >
                  {testConnectionMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>בודק...</span>
                    </div>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 ml-2" />
                      בדיקת חיבור
                    </>
                  )}
                </Button>
              </div>

              {connectionVerified && (
                <div className="flex items-center gap-2 text-green-700 bg-green-100 p-3 rounded-lg">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-bold">החיבור אומת בהצלחה ✅</span>
                </div>
              )}

              <div className="text-xs text-slate-600 bg-white p-3 rounded border">
                <p className="font-bold mb-1">💡 הערה חשובה:</p>
                <p>כרגע הפרטים נשמרים באופן זמני. לשינוי קבוע יש לעדכן את ה-Secrets בהגדרות האפליקציה.</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Button 
            onClick={() => importMutation.mutate()}
            disabled={!connectionVerified || importMutation.isPending}
            className="h-16 text-lg font-bold bg-black hover:bg-gray-800 text-white disabled:opacity-50"
          >
            <Upload className="w-6 h-6 ml-2" />
            {importMutation.isPending ? '...מייבא' : 'ייבוא מארבוקס'}
          </Button>

          <Button 
            onClick={() => {
              resetForm();
              setShowAddDialog(true);
            }}
            variant="outline"
            className="h-16 text-lg font-bold border-2"
          >
            <Plus className="w-6 h-6 ml-2" />
            הוסף ידנית
          </Button>
        </div>

        {!connectionVerified && (
          <div className="mb-6 flex items-center gap-2 text-amber-700 bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">כפתור הייבוא יהיה זמין רק לאחר בדיקת חיבור מוצלחת</span>
          </div>
        )}

        {/* Test Result */}
        {showTestResult && (
          <Card className={`mb-6 p-4 border-2 ${showTestResult.ok ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2">
                {showTestResult.ok ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                תוצאת בדיקת חיבור
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTestResult(null)}>✕</Button>
            </div>
            
            <div className="space-y-2 text-sm">
              <p><strong>HTTP Status:</strong> {showTestResult.status}</p>
              <p><strong>משך:</strong> {showTestResult.durationMs}ms</p>
              {showTestResult.totalFetched !== undefined && (
                <p><strong>חזרו מארבוקס:</strong> {showTestResult.totalFetched}</p>
              )}
              {showTestResult.errorCode && (
                <p className="text-red-700"><strong>Error Code:</strong> {showTestResult.errorCode}</p>
              )}
              {showTestResult.uniqueIdentifier && (
                <p className="text-xs text-slate-600"><strong>Unique ID:</strong> {showTestResult.uniqueIdentifier}</p>
              )}
              {showTestResult.hint && (
                <div className="mt-3 p-3 bg-white/80 rounded border">
                  <p className="font-bold mb-1">💡 מה לעשות:</p>
                  <p className="whitespace-pre-wrap">{showTestResult.hint}</p>
                </div>
              )}
              {showTestResult.firstMember && (
                <div className="mt-3 p-3 bg-white rounded border">
                  <p className="font-bold mb-2">מתאמן ראשון (לדוגמה):</p>
                  <p className="font-medium">{showTestResult.firstMember.name}</p>
                  <p className="text-xs text-slate-600">{showTestResult.firstMember.phone}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Connection Logs Accordion */}
        <Accordion type="single" collapsible className="mb-6">
          <AccordionItem value="connection-logs">
            <AccordionTrigger className="text-lg font-bold">🔌 לוגי חיבור אחרונים (10)</AccordionTrigger>
            <AccordionContent>
              {connectionLogs.length === 0 ? (
                <p className="text-slate-500 p-4">אין לוגי חיבור עדיין</p>
              ) : (
                <div className="space-y-2">
                  {connectionLogs.map((log) => (
                    <Card key={log.id} className={`p-4 ${log.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border-2`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {log.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                          <span className="font-bold text-sm">בדיקת חיבור</span>
                          <Badge variant="outline" className="text-xs">
                            {log.status_code || 0}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {log.duration_ms}ms
                        </span>
                      </div>
                      
                      <div className="text-xs space-y-1 text-slate-700">
                        <p><strong>זמן:</strong> {new Date(log.created_date).toLocaleString('he-IL')}</p>
                        {log.box_id && <p><strong>Box ID:</strong> {log.box_id}</p>}
                        {log.members_count > 0 && <p><strong>מתאמנים שנמצאו:</strong> {log.members_count}</p>}
                        {log.error_code && <p><strong>Error Code:</strong> {log.error_code}</p>}
                        {log.unique_identifier && <p><strong>Unique ID:</strong> {log.unique_identifier}</p>}
                        {log.message && (
                          <div className="mt-2 p-2 bg-white/80 rounded border">
                            <p className="font-bold">{log.ok ? '✅' : '❌'} {log.message}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Integration Logs Accordion */}
        <Accordion type="single" collapsible className="mb-6">
          <AccordionItem value="logs">
            <AccordionTrigger className="text-lg font-bold">🔍 לוגי ייבוא אחרונים (10)</AccordionTrigger>
            <AccordionContent>
              {logs.length === 0 ? (
                <p className="text-slate-500 p-4">אין לוגים עדיין</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <Card key={log.id} className={`p-4 ${log.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border-2`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {log.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                          <span className="font-bold text-sm">
                            {log.action === 'test_connection' ? 'בדיקת חיבור' : 'ייבוא'}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {log.status || 0}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {log.durationMs}ms
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyLogToClipboard(log)}
                            className="h-7 px-2"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="text-xs space-y-1 text-slate-700">
                        <p><strong>זמן:</strong> {new Date(log.created_date).toLocaleString('he-IL')}</p>
                        {log.action === 'import_members' && (
                          <p><strong>תוצאות:</strong> יובאו {log.imported || 0} | עודכנו {log.updated || 0} | נמשכו {log.fetched || 0}</p>
                        )}
                        {log.errorCode && <p><strong>Error Code:</strong> {log.errorCode}</p>}
                        {log.uniqueIdentifier && <p><strong>Unique ID:</strong> {log.uniqueIdentifier}</p>}
                        {log.error && <p className="text-red-600"><strong>שגיאה:</strong> {log.error}</p>}
                        {log.hint && (
                          <div className="mt-2 p-2 bg-white/80 rounded border">
                            <p className="font-bold">💡 {log.hint}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Search */}
        <Card className="card-premium mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="חפש לפי שם או טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 input-premium"
            />
          </div>
        </Card>

        {/* Members List */}
        {filteredMembers.length === 0 ? (
          <Card className="card-premium border-2 border-dashed border-slate-300">
            <div className="empty-state">
              <Users className="empty-state-icon" />
              <h3 className="empty-state-title">אין מתאמנים</h3>
              <p className="empty-state-description">
                {members.length === 0 
                  ? 'לחץ על "בדיקת חיבור" תחילה, ואז "ייבוא מארבוקס"' 
                  : 'לא נמצאו תוצאות'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredMembers.map(member => (
              <Card key={member.id} className="card-premium">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="title-medium">{member.full_name}</h3>
                      <Badge variant="outline" className={member.source === 'ARBOX' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50'}>
                        {member.source === 'ARBOX' ? '📦 Arbox' : '👤 ידני'}
                      </Badge>
                    </div>
                    <p className="small-text text-slate-600">{member.phone_e164}</p>
                    {member.arbox_member_id && (
                      <p className="text-xs text-slate-400">Arbox ID: {member.arbox_member_id}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingMember(member);
                        setMemberName(member.full_name);
                        setMemberPhone(member.phone_e164);
                        setShowAddDialog(true);
                      }}
                      className="text-blue-600"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMemberMutation.mutate(member.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingMember ? 'עריכת מתאמן' : 'הוסף מתאמן ידנית'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="small-text font-semibold block mb-2">שם מלא *</label>
                <Input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="input-premium"
                  placeholder="ישראל ישראלי"
                />
              </div>

              <div>
                <label className="small-text font-semibold block mb-2">טלפון *</label>
                <Input
                  value={memberPhone}
                  onChange={(e) => setMemberPhone(e.target.value)}
                  className="input-premium"
                  placeholder="0501234567 או +972501234567"
                />
                <p className="text-xs text-slate-500 mt-1">פורמט: 05XXXXXXXX או +9725XXXXXXXX</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  ביטול
                </Button>
                <Button
                  onClick={handleSaveMember}
                  disabled={createMemberMutation.isPending}
                  className="btn-success flex-1"
                >
                  {createMemberMutation.isPending ? '...שומר' : 'שמור'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}