import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import reportMarkdown from '../AI_MEAL_ANALYSIS_FLOW_COMPARISON_REPORT.md?raw';

export default function AIMealAnalysisFlowReport() {
  const [copied, setCopied] = React.useState(false);

  const copyFullReport = async () => {
    await navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-4 space-y-3">
          <Button asChild variant="ghost" className="gap-2 text-slate-600">
            <Link to="/coach/nutrition-ai-debug">
              <ArrowRight className="w-4 h-4" />
              חזרה ל-Nutrition AI Debug
            </Link>
          </Button>

          <Button
            onClick={copyFullReport}
            className="w-full h-12 gap-2 bg-teal-600 hover:bg-teal-700 text-white text-base font-semibold rounded-xl shadow-sm"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {copied ? 'הדוח הועתק' : 'העתק דוח מלא'}
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b bg-white rounded-t-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                <FileText className="w-5 h-5 text-teal-600" />
                דוח השוואת Photo AI מול Text AI
              </CardTitle>
              <Button onClick={copyFullReport} variant="outline" className="gap-2 self-start sm:self-auto">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'הועתק' : 'העתק דוח מלא'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="bg-white p-5 sm:p-8">
            <ReactMarkdown className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-7 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-teal-700 prose-code:bg-teal-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
              {reportMarkdown}
            </ReactMarkdown>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}