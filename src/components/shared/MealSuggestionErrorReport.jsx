import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, Download, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

export default function MealSuggestionErrorReport({ open, onClose, error, diagnosticReport, elapsedMs, progressStep }) {
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    timeline: true,
    analysis: false,
    logs: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Build detailed error analysis - SAFE: no NaN, no UNKNOWN
  const safeDuration = Number.isFinite(elapsedMs) && elapsedMs > 0 ? (elapsedMs / 1000).toFixed(2) : '0.00';
  const safeLastStep = progressStep && progressStep !== 'UNKNOWN' ? progressStep : 'UNKNOWN_STEP_CAPTURED';
  
  const analysis = {
    issue: error?.message || 'מערכת קפאה',
    timestamp: new Date().toLocaleString('he-IL'),
    duration: `${safeDuration} שניות`,
    lastStep: safeLastStep,
    severity: Number.isFinite(elapsedMs) && elapsedMs > 3500 ? 'CRITICAL' : Number.isFinite(elapsedMs) && elapsedMs > 2500 ? 'HIGH' : 'MEDIUM'
  };

  // Root cause analysis
  const getRootCauseAnalysis = () => {
    if (!error) {
      return {
        title: 'קיפאון ללא שגיאה',
        causes: [
          'Loop אינסופי בקוד הייצור',
          'Promise שלא resolved',
          'Memory leak בעת בנית הקומבינציות',
          'State update שגוי גורם לrerender אינסופי'
        ]
      };
    }

    if (error && typeof error === 'string' && error.toLowerCase().includes('timeout')) {
      return {
        title: 'זמן חזק על הממגבלה',
        causes: [
          'מאכלים מועדפים יותר מדי (אלגוריתם קומבינטורי O(n²))',
          'חישוב nutritional values איטי',
          'מתן מאכלים משיכ בטעות מ-API'
        ]
      };
    }

    return {
      title: 'שגיאה לא ידועה',
      causes: ['בדוק את ה-console logs']
    };
  };

  const rootCause = getRootCauseAnalysis();

  const diagnosticTimeline = diagnosticReport?.steps || [];

  const troubleshootingSteps = [
    {
      step: 1,
      title: 'בדוק מספר מאכלים מועדפים',
      description: 'אם יותר מ-20, צא מהמערכת ולחץ "נקה מאכלים מועדפים"',
      action: 'הצג מידע'
    },
    {
      step: 2,
      title: 'בטל ונסה שוב',
      description: 'סגור את הדיאלוג והנסה שוב תוך 3 שניות',
      action: 'בטל'
    },
    {
      step: 3,
      title: 'אתחל את היישום',
      description: 'טען מחדש את העמוד כולו (F5 או Pull to Refresh)',
      action: 'טען מחדש'
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="bg-red-50 border-b border-red-200 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <DialogTitle className="text-red-800">דוח תקלה - בעיית ביצוע הצעות מוצרים</DialogTitle>
              <p className="text-sm text-red-700 mt-1">
                {analysis.timestamp} | {analysis.duration} | חומרה: {analysis.severity}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">

          {/* SUMMARY */}
          <Card className="border-l-4 border-l-red-600 bg-red-50 p-4">
            <button
              onClick={() => toggleSection('summary')}
              className="w-full flex items-center justify-between"
            >
              <h3 className="font-bold text-red-800">סיכום</h3>
              {expandedSections.summary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.summary && (
              <div className="mt-3 space-y-2 text-sm">
                <p><strong>בעיה:</strong> {analysis.issue}</p>
                <p><strong>נתקע בשלב:</strong> <code className="bg-red-100 px-2 py-1 rounded">{analysis.lastStep}</code></p>
                <p><strong>זמן חכייה:</strong> {analysis.duration}</p>
              </div>
            )}
          </Card>

          {/* ROOT CAUSE */}
          <Card className="border-l-4 border-l-orange-600 bg-orange-50 p-4">
            <button
              onClick={() => toggleSection('analysis')}
              className="w-full flex items-center justify-between"
            >
              <h3 className="font-bold text-orange-800">🔍 ניתוח סיבה שורש</h3>
              {expandedSections.analysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.analysis && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-medium text-orange-800">{rootCause.title}</p>
                <ul className="list-disc list-inside space-y-1 text-orange-700">
                  {rootCause.causes.map((cause, i) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* TIMELINE */}
          {diagnosticTimeline.length > 0 && (
            <Card className="border-l-4 border-l-blue-600 bg-blue-50 p-4">
              <button
                onClick={() => toggleSection('timeline')}
                className="w-full flex items-center justify-between"
              >
                <h3 className="font-bold text-blue-800">⏱️ ציר הזמן</h3>
                {expandedSections.timeline ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSections.timeline && (
                <div className="mt-3 space-y-2 text-xs font-mono">
                  {diagnosticTimeline.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold min-w-[50px]">+{(step.duration || 0).toFixed(0)}ms</span>
                      <span className="text-blue-700 flex-1">{step.name}</span>
                      <span className="text-blue-500">{step.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* TROUBLESHOOTING */}
          <Card className="border-l-4 border-l-green-600 bg-green-50 p-4">
            <button
              onClick={() => toggleSection('logs')}
              className="w-full flex items-center justify-between"
            >
              <h3 className="font-bold text-green-800">🔧 שלבי פתרון בעיות</h3>
              {expandedSections.logs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.logs && (
              <div className="mt-3 space-y-3">
                {troubleshootingSteps.map((item) => (
                  <div key={item.step} className="bg-white rounded p-3 border border-green-200">
                    <p className="font-medium text-sm text-green-900">
                      שלב {item.step}: {item.title}
                    </p>
                    <p className="text-xs text-green-800 mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* TECHNICAL DETAILS */}
          <details className="group">
            <summary className="cursor-pointer select-none p-3 bg-slate-100 rounded font-medium hover:bg-slate-200">
              📋 פרטים טכניים (למפתחים)
            </summary>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded mt-2 text-xs overflow-x-auto">
{JSON.stringify({
  userEmail: 'edengoldenberg@gmail.com',
  mealType: 'בוקר',
  targetCalories: 400,
  focus: 'מאוזן',
  error: error?.message || null,
  stage: safeLastStep,
  duration_ms: Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : 0,
  diagnostic_steps: diagnosticTimeline.length,
  report_generated: new Date().toISOString()
}, null, 2)}
            </pre>
          </details>

          {/* ACTIONS */}
          <div className="flex gap-2 pt-4">
            <Button 
              onClick={() => window.location.reload()}
              className="flex-1"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              טען מחדש
            </Button>
            <Button 
              onClick={() => {
                const report = `
ERROR REPORT
============
${analysis.timestamp}
Duration: ${analysis.duration}
Last Step: ${analysis.lastStep}
Error: ${error?.message}

Timeline:
${diagnosticTimeline.map(s => `  ${s.name}: ${s.duration}ms`).join('\n')}

Root Cause: ${rootCause.title}
Causes:
${rootCause.causes.map(c => `  - ${c}`).join('\n')}
                `.trim();
                copyToClipboard(report);
              }}
              variant="outline"
            >
              <Copy className="w-4 h-4 mr-2" />
              העתק דוח
            </Button>
            <Button 
              onClick={onClose}
              variant="ghost"
            >
              סגור
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}