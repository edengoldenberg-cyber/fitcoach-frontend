import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RecipeCard({ recipe }) {
  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i < Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
          />
        ))}
        <span className="text-sm text-slate-600 ml-1">
          {recipe.average_rating > 0 ? recipe.average_rating.toFixed(1) : 'חדש'}
        </span>
      </div>
    );
  };

  return (
    <Link to={`/RecipeDetail/${recipe.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full">
        {recipe.image_url && (
          <div className="w-full h-40 bg-slate-200 overflow-hidden">
            <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-4">
          <h3 className="font-bold text-lg mb-2 line-clamp-2">{recipe.title}</h3>
          
          <div className="flex items-center justify-between mb-3">
            {renderStars(recipe.average_rating)}
            <span className="text-xs text-slate-500">
              {recipe.comment_count} דירוגים
            </span>
          </div>

          {recipe.nutritional_report && (
            <div className="bg-slate-50 rounded p-3 mb-3 text-sm">
              <div className="flex gap-4">
                <div>
                  <span className="text-slate-600">קל׳</span>
                  <div className="font-bold text-slate-900">
                    {recipe.nutritional_report.per_serving_calories?.toFixed(0) || '—'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">חלבון</span>
                  <div className="font-bold text-slate-900">
                    {recipe.nutritional_report.per_serving_protein?.toFixed(1) || '—'}g
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">פחמימות</span>
                  <div className="font-bold text-slate-900">
                    {recipe.nutritional_report.per_serving_carbs?.toFixed(1) || '—'}g
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">שומן</span>
                  <div className="font-bold text-slate-900">
                    {recipe.nutritional_report.per_serving_fat?.toFixed(1) || '—'}g
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600 line-clamp-2 mb-3">{recipe.description}</p>
          
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>מעלה: {recipe.user_name}</span>
            {recipe.rating_count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {recipe.rating_count} דירוגים
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}