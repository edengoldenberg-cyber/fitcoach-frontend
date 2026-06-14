import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function MealReminderDebugger() {
  const [traineeEmail, setTraineeEmail] = useState('');
  const [mealType, setMealType] = useState('');
  const [trace, setTrace] = useState(null);

  const debugMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('debugMealReminderChain', {
        trainee_email: traineeEmail,
        meal_type: mealType || null
      });
      return response;
    },
    onSuccess: (response) => {
      if (response.ok) {
        setTrace(response.trace);
        toast.success('Debug trace completed');
      } else {
        toast.error(response.error);
      }
    },
    onError: (err) => {
      toast.error('Failed to debug');
      console.error(err);
    }
  });

  const handleDebug = () => {
    if (!traineeEmail) {
      toast.error('Enter trainee email');
      return;
    }
    debugMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Debug Meal Reminder Chain</h1>
          <p className="text-slate-600">Trace why meal reminders are not sending for one trainee</p>
        </div>

        {/* Input Section */}
        <Card className="card-premium">
          <CardHeader>
            <CardTitle>Select Trainee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-semibold mb-2 block">Trainee Email</Label>
              <Input
                placeholder="trainee@example.com"
                value={traineeEmail}
                onChange={(e) => setTraineeEmail(e.target.value)}
                className="input-premium"
              />
            </div>

            <div>
              <Label className="font-semibold mb-2 block">Check Meal Type (Optional)</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-detect from current time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast (10:00)</SelectItem>
                  <SelectItem value="lunch">Lunch (14:00)</SelectItem>
                  <SelectItem value="dinner">Dinner (19:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="btn-primary w-full"
              onClick={handleDebug}
              disabled={debugMutation.isPending}
            >
              <Play className="w-4 h-4 ml-2" />
              {debugMutation.isPending ? 'Running trace...' : 'Start Debug Trace'}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {trace && (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="card-premium border-2" style={{
              borderColor: trace.verdict.would_send ? '#10b981' : '#ef4444'
            }}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {trace.verdict.would_send ? (
                    <>
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                      <div>
                        <CardTitle>Would Send: YES ✅</CardTitle>
                        <CardDescription>Reminder would be sent to this trainee</CardDescription>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-6 h-6 text-red-600" />
                      <div>
                        <CardTitle>Would Send: NO ❌</CardTitle>
                        <CardDescription>Reminder blocked from sending</CardDescription>
                      </div>
                    </>
                  )}
                </div>
              </CardHeader>

              {trace.verdict.issues_found.length > 0 && (
                <CardContent>
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700 mt-2">
                      <ul className="space-y-1">
                        {trace.verdict.issues_found.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              )}
            </Card>

            {/* Time Conditions */}
            <Card className="card-premium">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Time Conditions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Current Time (Israel)</p>
                    <p className="font-mono text-lg">{trace.steps.time_conditions.current_time_israel}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Active Meal Window</p>
                    <p className="font-mono text-lg">
                      {trace.steps.time_conditions.active_meal_window || 'None'} {trace.steps.time_conditions.meal_window_time ? `@ ${trace.steps.time_conditions.meal_window_time}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Inside Window</p>
                    <p className={`font-semibold ${trace.steps.time_conditions.inside_window ? 'text-green-600' : 'text-red-600'}`}>
                      {trace.steps.time_conditions.inside_window ? 'YES' : 'NO'}
                    </p>
                  </div>
                  {trace.steps.time_conditions.reason && (
                    <div>
                      <p className="text-sm text-slate-500">Reason</p>
                      <p className="text-sm text-orange-600">{trace.steps.time_conditions.reason}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Trainee Eligibility */}
            {trace.steps.trainee_eligibility.found && (
              <Card className="card-premium">
                <CardHeader>
                  <CardTitle className="text-lg">Trainee Eligibility</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Name</p>
                      <p className="font-semibold">{trace.steps.trainee_eligibility.trainee_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Email</p>
                      <p className="text-sm font-mono">{trace.steps.trainee_eligibility.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Phone</p>
                      <p className="font-mono">{trace.steps.trainee_eligibility.phone || 'NONE'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Status</p>
                      <p className={trace.steps.trainee_eligibility.status === 'active' ? 'text-green-600' : 'text-red-600'}>
                        {trace.steps.trainee_eligibility.status}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">WhatsApp Enabled</p>
                      <p className={trace.steps.trainee_eligibility.whatsapp_enabled ? 'text-green-600' : 'text-red-600'}>
                        {trace.steps.trainee_eligibility.whatsapp_enabled ? 'YES' : 'NO'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Coach</p>
                      <p className="text-sm font-mono">{trace.steps.trainee_eligibility.coach_email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* User State */}
            {trace.steps.user_state.loaded && (
              <Card className="card-premium">
                <CardHeader>
                  <CardTitle className="text-lg">User State Snapshot</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Meals Today</p>
                      <p className="text-2xl font-bold">{trace.steps.user_state.meals_logged_today}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Messages Today</p>
                      <p className="text-2xl font-bold">{trace.steps.user_state.messages_sent_today}/2</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Water Progress</p>
                      <p className="text-2xl font-bold">{Math.round(trace.steps.user_state.water_progress)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Last Login</p>
                      <p className="text-sm">{trace.steps.user_state.last_login_hours_ago}h ago</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Recovery Mode</p>
                      <p className={trace.steps.user_state.is_in_recovery ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        {trace.steps.user_state.is_in_recovery ? 'YES' : 'NO'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Silent Count</p>
                      <p className={trace.steps.user_state.silent_count >= 3 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                        {trace.steps.user_state.silent_count}/3
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reminder Engine Decision */}
            {trace.steps.reminder_engine && (
              <Card className="card-premium">
                <CardHeader>
                  <CardTitle className="text-lg">Smart Reminder Engine Decision</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Decision</span>
                      <span className={`font-bold ${trace.steps.reminder_engine.decision === 'SEND' ? 'text-green-600' : 'text-red-600'}`}>
                        {trace.steps.reminder_engine.decision}
                      </span>
                    </div>
                    {trace.steps.reminder_engine.reason && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-600">Reason</span>
                        <span className="text-sm font-mono">{trace.steps.reminder_engine.reason}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Event Logs */}
            {trace.steps.event_logs && (
              <Card className="card-premium">
                <CardHeader>
                  <CardTitle className="text-lg">Event Logs (Today)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-3 text-slate-600">
                    Total today: {trace.steps.event_logs.total_today} | Relevant to meal type: {trace.steps.event_logs.relevant_to_meal_type}
                  </p>
                  {trace.steps.event_logs.relevant_events.length > 0 ? (
                    <div className="space-y-2">
                      {trace.steps.event_logs.relevant_events.map((event, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-sm">{event.trigger_type}</span>
                            <span className={event.sent ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                              {event.sent ? '✓ SENT' : '✗ BLOCKED'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{event.timestamp}</p>
                          {event.blocked_reason && (
                            <p className="text-xs text-red-600 mt-1">Reason: {event.blocked_reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">No relevant events logged today</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}