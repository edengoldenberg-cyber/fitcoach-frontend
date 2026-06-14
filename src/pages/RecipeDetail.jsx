import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RecipeDetail() {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: recipe, isLoading: recipeLoading } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => base44.entities.Recipe.get(recipeId),
  });

  const { data: ratings = [], refetch: refetchRatings } = useQuery({
    queryKey: ['ratings', recipeId],
    queryFn: () => base44.entities.RecipeRating.filter({ recipe_id: recipeId }),
    enabled: !!recipeId,
  });

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.error('בחר דירוג');
      return;
    }

    setSubmitting(true);
    try {
      const user = await base44.auth.me();

      await base44.entities.RecipeRating.create({
        recipe_id: recipeId,
        user_email: user.email,
        user_name: user.full_name,
        rating,
        comment: comment.trim() || null,
      });

      // Update recipe rating
      const avgRating = ((recipe.average_rating * (recipe.rating_count || 0)) + rating) / ((recipe.rating_count || 0) + 1);
      await base44.entities.Recipe.update(recipeId, {
        average_rating: avgRating,
        rating_count: (recipe.rating_count || 0) + 1,
        comment_count: comment.trim() ? (recipe.comment_count || 0) + 1 : (recipe.comment_count || 0),
      });

      toast.success('דירוגך נוסף בהצלחה!');
      setRating(0);
      setComment('');
      refetchRatings();
    } catch (error) {
      console.error('Error submitting rating:', error);
      toast.error('שגיאה בשמירת הדירוג');
    } finally {
      setSubmitting(false);
    }
  };

  if (recipeLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold">המתכון לא נמצא</h2>
        <Button onClick={() => navigate('/Recipes')} className="mt-4">
          חזור למתכונים
        </Button>
      </div>
    );
  }

  const avgRating = recipe.average_rating || 0;

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/Recipes')}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            חזור
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Image */}
        {recipe.image_url && (
          <div className="mb-8 rounded-lg overflow-hidden">
            <img src={recipe.image_url} alt={recipe.title} className="w-full h-96 object-cover" />
          </div>
        )}

        {/* Title & Meta */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{recipe.title}</h1>
          
          <div className="flex items-center gap-4 text-slate-600 mb-6">
            <span>מעלה: <strong>{recipe.user_name}</strong></span>
            <span>•</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                />
              ))}
              <span className="ml-2">
                {avgRating > 0 ? `${avgRating.toFixed(1)} (${recipe.rating_count} דירוגים)` : 'עדיין אין דירוגים'}
              </span>
            </div>
          </div>
        </div>

        {/* Nutritional Info */}
        {recipe.nutritional_report && (
          <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-lg p-6 mb-8">
            <h2 className="font-bold text-lg mb-4">📊 ערכים תזונתיים למנה</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-slate-600 text-sm">קלוריות</div>
                <div className="text-2xl font-bold" style={{ color: '#79DBD6' }}>
                  {recipe.nutritional_report.per_serving_calories?.toFixed(0) || '—'}
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-slate-600 text-sm">חלבון</div>
                <div className="text-2xl font-bold text-blue-600">
                  {recipe.nutritional_report.per_serving_protein?.toFixed(1) || '—'}g
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-slate-600 text-sm">פחמימות</div>
                <div className="text-2xl font-bold text-orange-600">
                  {recipe.nutritional_report.per_serving_carbs?.toFixed(1) || '—'}g
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-slate-600 text-sm">שומן</div>
                <div className="text-2xl font-bold text-red-600">
                  {recipe.nutritional_report.per_serving_fat?.toFixed(1) || '—'}g
                </div>
              </div>
            </div>
            {recipe.nutritional_report.servings && (
              <p className="text-sm text-slate-600 mt-4">
                חלוקה ל-{recipe.nutritional_report.servings} מנות
              </p>
            )}
            {recipe.nutritional_report.summary && (
              <p className="text-sm text-slate-700 mt-4 italic">
                {recipe.nutritional_report.summary}
              </p>
            )}
          </div>
        )}

        {/* Description */}
        <div className="mb-8">
          <h2 className="font-bold text-lg mb-4">📝 הוראות הכנה</h2>
          <p className="text-slate-700 whitespace-pre-wrap">{recipe.description}</p>
        </div>

        {/* Ingredients */}
        <div className="mb-8">
          <h2 className="font-bold text-lg mb-4">🥘 מרכיבים</h2>
          <ul className="space-y-2">
            {recipe.ingredients?.map((ing, i) => (
              <li key={i} className="flex items-center gap-3 text-slate-700">
                <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                <span>{ing.quantity} {ing.unit} {ing.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Ratings Section */}
        <div className="border-t pt-8">
          <h2 className="font-bold text-lg mb-6">⭐ דירוגים ותגובות</h2>

          {/* Submit Rating */}
          <div className="bg-slate-50 rounded-lg p-6 mb-8">
            <p className="mb-4 font-medium">תן דירוג למתכון</p>
            
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            <Textarea
              placeholder="שתף את הדעה שלך על המתכון (אופציונלי)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mb-4"
              disabled={submitting}
            />

            <Button
              onClick={handleSubmitRating}
              disabled={submitting || rating === 0}
              style={{ backgroundColor: rating > 0 ? '#79DBD6' : undefined }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  שולח...
                </>
              ) : (
                'שלח דירוג'
              )}
            </Button>
          </div>

          {/* Existing Ratings */}
          <div className="space-y-4">
            {ratings.length === 0 ? (
              <p className="text-slate-600 text-center py-8">אין דירוגים עדיין</p>
            ) : (
              ratings.map((r) => (
                <div key={r.id} className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <strong className="text-slate-800">{r.user_name}</strong>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < r.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-slate-700">{r.comment}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}