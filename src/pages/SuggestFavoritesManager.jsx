import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Star, StarOff, Search, Filter, Edit2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const MEAL_TAGS = ['בוקר', 'צהריים', 'ערב', 'ביניים'];
const ROLES = ['חלבון', 'פחמימה', 'שומן', 'ירק/חופשי', 'מתוק/פינוק'];

export default function SuggestFavoritesManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const isCoach = (coachTrainees && coachTrainees.length > 0) || user?.role === 'admin';

  const { data: allFoods = [], isLoading } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }) => 
      base44.entities.FoodItem.update(id, { 
        is_suggest_favorite: !isFavorite,
        suggest_meal_tags: !isFavorite ? [] : undefined,
        suggest_role: !isFavorite ? '' : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFoods'] });
      toast.success('סטטוס מועדף עודכן');
    },
  });

  const updateFoodMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FoodItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFoods'] });
      toast.success('המוצר עודכן');
    },
  });

  const favoriteFoods = useMemo(() => {
    return allFoods.filter(f => f.is_suggest_favorite);
  }, [allFoods]);

  const filteredFavorites = useMemo(() => {
    return favoriteFoods.filter(f => {
      const matchSearch = !searchTerm || 
        f.name_he?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.brand?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchTag = tagFilter === 'all' || 
        (f.suggest_meal_tags && f.suggest_meal_tags.includes(tagFilter));
      
      const matchRole = roleFilter === 'all' || f.suggest_role === roleFilter;
      
      return matchSearch && matchTag && matchRole;
    });
  }, [favoriteFoods, searchTerm, tagFilter, roleFilter]);

  if (!isCoach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-red-600 font-medium">אין הרשאה לצפות במסך זה</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ניהול מאכלים מועדפים</h1>
            <p className="text-sm text-slate-600">מאכלים אלו יוצעו למתאמנים באופן אוטומטי</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-slate-600">סה"כ מועדפים</p>
              <p className="text-2xl font-bold text-amber-600">{favoriteFoods.length}</p>
            </CardContent>
          </Card>
          {MEAL_TAGS.map(tag => (
            <Card key={tag}>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-600">{tag}</p>
                <p className="text-2xl font-bold text-slate-800">
                  {favoriteFoods.filter(f => f.suggest_meal_tags?.includes(tag)).length}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>חיפוש</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="שם מוצר או מותג..."
                    className="pr-10"
                  />
                </div>
              </div>
              <div>
                <Label>ארוחה</Label>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הארוחות</SelectItem>
                    {MEAL_TAGS.map(tag => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>תפקיד</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל התפקידים</SelectItem>
                    {ROLES.map(role => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Foods List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-slate-600">טוען מוצרים...</p>
          </div>
        ) : filteredFavorites.length === 0 ? (
          <Card className="p-8 text-center">
            <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">אין מאכלים מועדפים להצגה</p>
            <p className="text-sm text-slate-500 mt-1">הוסף מוצרים כמועדפים ממאגר המזון</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredFavorites.map(food => (
              <FoodCard 
                key={food.id} 
                food={food} 
                onToggleFavorite={() => toggleFavoriteMutation.mutate({ 
                  id: food.id, 
                  isFavorite: food.is_suggest_favorite 
                })}
                onUpdate={(data) => updateFoodMutation.mutate({ id: food.id, data })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FoodCard({ food, onToggleFavorite, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(food.suggest_meal_tags || []);
  const [role, setRole] = useState(food.suggest_role || '');
  const [priority, setPriority] = useState(food.suggest_priority || 3);

  const handleSave = () => {
    onUpdate({
      suggest_meal_tags: tags,
      suggest_role: role,
      suggest_priority: priority
    });
    setEditing(false);
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <Button
            onClick={onToggleFavorite}
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
          >
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
          </Button>

          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-slate-800">{food.name_he}</h3>
                {food.brand && <p className="text-xs text-slate-500">{food.brand}</p>}
                <div className="flex gap-2 mt-1 text-xs text-slate-600">
                  <span>{food.per100_kcal} קק"ל</span>
                  <span>•</span>
                  <span>{food.per100_protein}ג׳ חלבון</span>
                </div>
              </div>
              <Button
                onClick={() => setEditing(!editing)}
                variant="ghost"
                size="sm"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            </div>

            {!editing ? (
              <div className="flex gap-2 flex-wrap">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {role && (
                  <Badge className="text-xs bg-purple-100 text-purple-800">
                    {role}
                  </Badge>
                )}
                <Badge className="text-xs bg-slate-100 text-slate-700">
                  עדיפות: {priority}
                </Badge>
              </div>
            ) : (
              <div className="space-y-3 mt-3 pt-3 border-t">
                <div>
                  <Label className="text-xs">ארוחות</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {MEAL_TAGS.map(tag => (
                      <label key={tag} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tags.includes(tag)}
                          onChange={(e) => {
                            const newTags = e.target.checked
                              ? [...tags, tag]
                              : tags.filter(t => t !== tag);
                            setTags(newTags);
                          }}
                          className="w-3 h-3"
                        />
                        <span className="text-xs">{tag}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">תפקיד</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="בחר תפקיד" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">עדיפות</Label>
                  <Select value={priority.toString()} onValueChange={(v) => setPriority(Number(v))}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(p => (
                        <SelectItem key={p} value={p.toString()}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" className="flex-1">
                    שמור
                  </Button>
                  <Button onClick={() => setEditing(false)} variant="outline" size="sm" className="flex-1">
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}