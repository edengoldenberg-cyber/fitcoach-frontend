import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import AddRecipeDialog from '@/components/trainee/AddRecipeDialog';
import RecipeCard from '@/components/recipe/RecipeCard';

export default function Recipes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: recipes = [], isLoading, refetch } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.filter({ status: 'published' }),
  });

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.user_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold" style={{ color: '#79DBD6' }}>
              📚 מתכונים קהילתיים
            </h1>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">מתכון חדש</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חפש מתכונים..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin"></div>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🍽️</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {searchTerm ? 'לא נמצאו מתכונים' : 'אין מתכונים עדיין'}
            </h2>
            <p className="text-slate-600 mb-6">
              {searchTerm
                ? 'נסה לחפש בטקסט אחר'
                : 'היה הראשון/ה להוסיף מתכון!'}
            </p>
            {!searchTerm && (
              <Button
                onClick={() => setShowAddDialog(true)}
                style={{ backgroundColor: '#79DBD6' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                הוסף מתכון
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </div>

      {/* Add Recipe Dialog */}
      <AddRecipeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => refetch()}
      />
    </div>
  );
}