import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Watch, Smartphone, Activity, Heart, TrendingUp, CheckCircle2, XCircle, RefreshCw, Zap } from "lucide-react";
import BackButton from '../components/shared/BackButton';

const DEVICE_OPTIONS = [
  {
    type: 'google_fit',
    name: 'Google Fit',
    icon: '📊',
    color: 'from-blue-500 to-blue-600',
    description: 'שעוני Android, Google Pixel Watch',
    features: ['צעדים', 'קלוריות', 'דופק', 'שינה']
  },
  {
    type: 'apple_health',
    name: 'Apple Health',
    icon: '🍎',
    color: 'from-red-500 to-pink-600',
    description: 'Apple Watch, iPhone',
    features: ['צעדים', 'קלוריות', 'דופק', 'שינה', 'חמצן בדם']
  },
  {
    type: 'fitbit',
    name: 'Fitbit',
    icon: '⚡',
    color: 'from-teal-500 to-cyan-600',
    description: 'שעוני Fitbit, Charge, Versa',
    features: ['צעדים', 'קלוריות', 'דופק', 'שינה']
  },
  {
    type: 'garmin',
    name: 'Garmin',
    icon: '🎯',
    color: 'from-blue-600 to-indigo-700',
    description: 'שעוני Garmin, Forerunner',
    features: ['צעדים', 'קלוריות', 'דופק', 'VO2 Max']
  },
  {
    type: 'samsung_health',
    name: 'Samsung Health',
    icon: '📱',
    color: 'from-purple-500 to-purple-700',
    description: 'Galaxy Watch, Samsung Health',
    features: ['צעדים', 'קלוריות', 'דופק', 'שינה']
  },
  {
    type: 'polar',
    name: 'Polar',
    icon: '❄️',
    color: 'from-sky-500 to-blue-600',
    description: 'רצועות דופק Polar',
    features: ['דופק', 'קלוריות', 'אזורי אימון']
  },
  {
    type: 'whoop',
    name: 'WHOOP',
    icon: '💪',
    color: 'from-slate-700 to-slate-900',
    description: 'צמיד WHOOP',
    features: ['דופק', 'התאוששות', 'עומס אימון', 'שינה']
  }
];

export default function DeviceConnect() {
  const [connecting, setConnecting] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: connectedDevices = [] } = useQuery({
    queryKey: ['connectedDevices', user?.email],
    queryFn: () => base44.entities.ConnectedDevice.filter({ trainee_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: todayStats } = useQuery({
    queryKey: ['deviceStats', user?.email],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const stats = await base44.entities.DeviceDailyStats.filter({ 
        trainee_email: user?.email, 
        date: today 
      });
      return stats[0];
    },
    enabled: !!user?.email,
  });

  const connectMutation = useMutation({
    mutationFn: async (device) => {
      return base44.entities.ConnectedDevice.create({
        trainee_email: user?.email,
        device_type: device.type,
        device_name: device.name,
        connected_at: new Date().toISOString(),
        is_active: true,
        permissions: {
          steps: true,
          heart_rate: true,
          calories: true,
          sleep: true
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectedDevices'] });
      setConnecting(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (deviceId) => base44.entities.ConnectedDevice.delete(deviceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectedDevices'] }),
  });

  const syncMutation = useMutation({
    mutationFn: async (deviceId) => {
      await base44.entities.ConnectedDevice.update(deviceId, {
        last_sync_at: new Date().toISOString()
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectedDevices'] }),
  });

  const handleConnect = async (device) => {
    setConnecting(device.type);
    
    // Simulate OAuth flow
    setTimeout(() => {
      connectMutation.mutate(device);
    }, 1500);
  };

  const isConnected = (deviceType) => {
    return connectedDevices.some(d => d.device_type === deviceType && d.is_active);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        <BackButton />
        
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
            <Watch className="w-7 h-7 text-blue-600" />
            מכשירי כושר חכמים
          </h1>
          <p className="text-slate-600 text-sm">
            חבר שעון חכם או רצועת דופק למעקב אוטומטי
          </p>
        </div>

        {/* Today's Data Summary */}
        {todayStats && (
          <Card className="p-4 mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              נתונים מהמכשיר היום
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-xs text-slate-500">צעדים</p>
                <p className="text-xl font-bold text-blue-600">
                  {todayStats.steps?.toLocaleString() || '0'}
                </p>
              </div>
              <div className="text-center p-3 bg-white rounded-lg">
                <p className="text-xs text-slate-500">קלוריות</p>
                <p className="text-xl font-bold text-orange-600">
                  {todayStats.device_calories_burned || '0'}
                </p>
              </div>
              {todayStats.heart_rate_avg && (
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-xs text-slate-500">דופק ממוצע</p>
                  <p className="text-xl font-bold text-red-600">
                    {todayStats.heart_rate_avg}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Connected Devices */}
        {connectedDevices.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-700 mb-3">מכשירים מחוברים</h3>
            <div className="space-y-2">
              {connectedDevices.map(device => {
                const deviceInfo = DEVICE_OPTIONS.find(d => d.type === device.device_type);
                return (
                  <Card key={device.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${deviceInfo?.color} flex items-center justify-center text-white text-lg`}>
                          {deviceInfo?.icon}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{device.device_name}</p>
                          <p className="text-xs text-slate-500">
                            {device.last_sync_at 
                              ? `סונכרן לאחרונה: ${new Date(device.last_sync_at).toLocaleString('he-IL')}`
                              : 'טרם סונכרן'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => syncMutation.mutate(device.id)}
                          disabled={syncMutation.isPending}
                        >
                          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => disconnectMutation.mutate(device.id)}
                        >
                          <XCircle className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Devices */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-3">מכשירים זמינים לחיבור</h3>
          <div className="space-y-3">
            {DEVICE_OPTIONS.map(device => (
              <Card 
                key={device.type} 
                className={`p-4 transition-all ${isConnected(device.type) ? 'opacity-50' : 'hover:shadow-md cursor-pointer'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${device.color} flex items-center justify-center text-white text-2xl`}>
                      {device.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 mb-1">{device.name}</h4>
                      <p className="text-xs text-slate-600 mb-2">{device.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {device.features.map(feature => (
                          <span key={feature} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {isConnected(device.type) ? (
                    <div className="flex items-center gap-1 text-green-600 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>מחובר</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleConnect(device)}
                      disabled={connecting === device.type}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {connecting === device.type ? (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          מתחבר...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3 mr-1" />
                          חבר
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Info Card */}
        <Card className="p-4 mt-6 bg-blue-50 border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <Heart className="w-4 h-4" />
            איך זה עובד?
          </h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• חבר את המכשיר החכם שלך בלחיצה אחת</li>
            <li>• הנתונים יסונכרנו אוטומטית מדי יום</li>
            <li>• המאמן שלך יראה את הצעדים, הדופק והקלוריות</li>
            <li>• אין צורך להזין נתונים ידנית יותר!</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}