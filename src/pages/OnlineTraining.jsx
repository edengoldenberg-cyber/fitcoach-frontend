import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users, Calendar, Dumbbell, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function OnlineTraining() {
  const [searchTerm, setSearchTerm] = useState('');

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

  const { data: templates = [] } = useQuery({
    queryKey: ['onlineTemplates', user?.email],
    queryFn: () => base44.entities.OnlineWorkoutTemplate.filter({ 
      coach_email: user?.email 
    }),
    enabled: !!user?.email,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['onlineAssignments', user?.email],
    queryFn: async () => {
      const allAssignments = await base44.entities.OnlineWorkoutAssignment.list();
      return allAssignments.filter(a => {
        const template = templates.find(t => t.id === a.template_id);
        return template?.coach_email === user?.email;
      });
    },
    enabled: !!user?.email && templates.length > 0,
  });

  const filteredTrainees = trainees.filter(t => 
    t.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activePrograms = templates.filter(t => t.status === 'active');
  const totalAssignments = assignments.filter(a => a.status === 'active').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-indigo-900 flex items-center gap-3">
            <Dumbbell className="w-8 h-8 text-indigo-600" />
            אימונים אונליין
          </h1>
          <p className="text-slate-600 mt-2">תכניות אימון אישיות למתאמנים מרחוק</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 text-center bg-white">
            <p className="text-2xl font-bold text-indigo-600">{activePrograms.length}</p>
            <p className="text-xs text-slate-500">תכניות פעילות</p>
          </Card>
          <Card className="p-4 text-center bg-white">
            <p className="text-2xl font-bold text-blue-600">{totalAssignments}</p>
            <p className="text-xs text-slate-500">משובצים</p>
          </Card>
          <Card className="p-4 text-center bg-white">
            <p className="text-2xl font-bold text-green-600">{trainees.length}</p>
            <p className="text-xs text-slate-500">מתאמנים</p>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link to={createPageUrl('CreateDailyPersonal')}>
            <Button className="w-full h-24 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 flex flex-col gap-2">
              <Calendar className="w-6 h-6" />
              <div className="text-center">
                <p className="font-bold">אימון יומי אישי</p>
                <p className="text-xs opacity-90">שלח אימון בודד</p>
              </div>
            </Button>
          </Link>
          <Link to={createPageUrl('CreateProgram')}>
            <Button className="w-full h-24 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 flex flex-col gap-2">
              <Dumbbell className="w-6 h-6" />
              <div className="text-center">
                <p className="font-bold">תכנית תקופתית</p>
                <p className="text-xs opacity-90">בנה תכנית לשבועות</p>
              </div>
            </Button>
          </Link>
        </div>

        {/* Trainee Search */}
        <Card className="p-4 bg-white mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-5 h-5 text-slate-500" />
            <h2 className="font-bold text-lg">מתאמנים</h2>
          </div>
          <div className="relative mb-4">
            <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
            <Input
              placeholder="חפש מתאמן..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredTrainees.map(trainee => {
              const traineeAssignments = assignments.filter(a => 
                a.trainee_email === trainee.user_email && a.status === 'active'
              );
              return (
                <Link 
                  key={trainee.id} 
                  to={createPageUrl(`TraineeOnlineWorkouts?email=${trainee.user_email}`)}
                >
                  <div className="p-3 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-slate-800">{trainee.full_name}</p>
                        <p className="text-xs text-slate-500">{trainee.user_email}</p>
                      </div>
                      {traineeAssignments.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                            {traineeAssignments.length} תכניות
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* Recent Templates */}
        <Card className="p-4 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">תכניות אחרונות</h2>
            <Button variant="outline" size="sm">הצג הכל</Button>
          </div>
          {templates.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>עדיין לא יצרת תכניות אימון אונליין</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.slice(0, 5).map(template => (
                <div key={template.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-slate-800">{template.title}</p>
                      <p className="text-xs text-slate-500">
                        {template.type === 'daily_personal' ? 'אימון יומי' : `תכנית ${template.duration_weeks} שבועות`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      template.status === 'active' ? 'bg-green-100 text-green-700' :
                      template.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {template.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}