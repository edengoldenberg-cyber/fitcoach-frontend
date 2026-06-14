import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function CreateProgram() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [title, setTitle] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [daysPerWeek, setDaysPerWeek] = useState(3);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ 
      coach_email: user?.email,
      status: 'active'
    }),
    enabled: !!user?.email,
  });

  const handleNext = () => {
    if (step === 1 && (!selectedTrainee || !title)) {
      toast.error('יש למלא את כל השדות');
      return;
    }
    if (step < 3) setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-blue-900">בניית תכנית תקופתית</h1>
            <p className="text-sm text-slate-600">שלב {step} מתוך 3</p>
          </div>
        </div>

        {step === 1 && (
          <Card className="p-6 bg-white">
            <h2 className="text-lg font-bold mb-4">פרטי התכנית</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">בחר מתאמן</label>
                <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מתאמן..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trainees.map(t => (
                      <SelectItem key={t.id} value={t.user_email}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">שם התכנית</label>
                <Input 
                  placeholder="למשל: תכנית חיזוק 8 שבועות"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">משך בשבועות</label>
                <Select value={String(durationWeeks)} onValueChange={(v) => setDurationWeeks(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 6, 8, 12].map(w => (
                      <SelectItem key={w} value={String(w)}>{w} שבועות</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">ימי אימון בשבוע</label>
                <Select value={String(daysPerWeek)} onValueChange={(v) => setDaysPerWeek(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6].map(d => (
                      <SelectItem key={d} value={String(d)}>{d} ימים</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full mt-6 bg-blue-600" onClick={handleNext}>
              המשך
              <ChevronLeft className="w-4 h-4 mr-2" />
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6 bg-white text-center">
            <h2 className="text-lg font-bold mb-4">בחר ימי אימון</h2>
            <p className="text-slate-600 mb-6">תכונה זו תהיה זמינה בקרוב...</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronRight className="w-4 h-4 ml-2" />
                חזור
              </Button>
              <Button className="flex-1 bg-blue-600" onClick={() => toast.info('התכונה בפיתוח')}>
                המשך לבניית אימונים
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}