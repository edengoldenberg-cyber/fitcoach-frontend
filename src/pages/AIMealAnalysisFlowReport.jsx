import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AIMealAnalysisFlowReport() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Button asChild variant="ghost" className="gap-2 text-slate-600 mb-4">
          <Link to="/coach/nutrition-ai-debug">
            <ArrowRight className="w-4 h-4" />
            חזרה ל-Nutrition AI Debug
          </Link>
        </Button>
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b bg-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
              <FileText className="w-5 h-5 text-teal-600" />
              דוח השוואת Photo AI מול Text AI
            </CardTitle>
          </CardHeader>
          <CardContent className="bg-white p-8 text-center text-slate-400">
            הדוח הוסר בגרסה הנוכחית.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}