import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Upload, Loader2, CheckCircle2, X } from "lucide-react";
import { base44 } from '@/api/base44Client';

export default function AddWorkoutFromPhoto({ open, onClose, onWorkoutDetected }) {
  const [step, setStep] = useState('upload'); // upload, analyzing, review
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [detectedExercises, setDetectedExercises] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleCapture = () => {
    document.getElementById('workout-camera-input').click();
  };

  const handleAnalyze = async () => {
    if (!imageFile) return;

    setIsProcessing(true);
    setStep('analyzing');

    try {
      // Upload image
      const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });

      // Analyze with AI
       const response = await base44.integrations.Core.InvokeLLM({
         prompt: `אתה מומחה בזיהוי ותרגום תוכניות אימונים מתוך תמונות.

      עליך לזהות ולקרוא בשקיקות את כל שמות התרגילים הכתובים בתמונה, בין אם בעברית או באנגלית.

      דוגמאות לשמות תרגילים בעברית והתרגומים שלהם:
      - דד ליפט / מתים = Deadlift
      - סקוואט / כפיפות = Squat
      - לחיצת חזה = Bench Press
      - לחיצת כתפיים = Shoulder Press
      - משיכת כבל עליון / פולאובר = Lat Pulldown
      - תיפקס / כפיפות זרועות = Bicep Curl
      - Tricep Dips = דיפס
      - פלאנק = Plank
      - Leg Press = לחיצת רגליים
      - Rowing = שיוט / משיכה
      - Leg Curl = כפיפת רגל

      הנחיות זיהוי:
      1. קרא בעיון רב את כל הטקסט בתמונה - פעם אחת מלמטה למעלה, ופעם שנייה ממשמאל לימין
      2. אם רואה קיצור או אות בודדת, נסה להבין מה היא מסמנת (L=Leg, C=Chest וכו')
      3. התעלם ממספרים ויחידות (3x10, 4 סטים, 60 ק״ג וכו')
      4. אם יש שם בעברית - חזור אותו בדיוק, או תרגם לאנגלית אם הכיתוב לא ברור
      5. אם יש שם באנגלית - חזור אותו בדיוק
      6. אם הטקסט לא ברור או מעורבב - נסה להעריך את משמעותו
      7. דלג רק על טקסט שהוא בוודאות לא שם של תרגיל

      החזר JSON במבנה:
      {
      "exercises": [
      {"name": "שם התרגיל בעברית"},
      {"name": "שם נוסף"}
      ],
      "confidence": "high|medium|low",
      "notes": "הערות אם יש טקסט לא ברור"
      }`,
         file_urls: [file_url],
         add_context_from_internet: true,
         response_json_schema: {
           type: "object",
           properties: {
             exercises: {
               type: "array",
               items: {
                 type: "object",
                 properties: {
                   name: { type: "string" }
                 }
               }
             },
             confidence: { type: "string" },
             notes: { type: "string" }
           }
         }
       });

      if (response.exercises && response.exercises.length > 0) {
        setDetectedExercises(response.exercises);
        setStep('review');
      } else {
        alert('לא זוהו תרגילים בתמונה. נסה שוב עם תמונה ברורה יותר.');
        setStep('upload');
      }
    } catch (error) {
      console.error('Error analyzing workout:', error);
      alert('אירעה שגיאה בניתוח התמונה');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    onWorkoutDetected(detectedExercises.map(e => e.name));
    handleClose();
  };

  const removeExercise = (index) => {
    setDetectedExercises(detectedExercises.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setStep('upload');
    setImageFile(null);
    setImagePreview(null);
    setDetectedExercises([]);
    setIsProcessing(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Camera className="w-6 h-6 text-orange-500" />
            צלם לוח אימון
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              צלם את לוח האימון או העלה תמונה של רשימת התרגילים
            </p>

            {imagePreview && (
              <Card className="p-2">
                <img src={imagePreview} alt="Preview" className="w-full rounded-lg" />
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={handleCapture}
                className="h-20 flex flex-col gap-2"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm">צלם עכשיו</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => document.getElementById('workout-file-input').click()}
                className="h-20 flex flex-col gap-2"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm">העלה תמונה</span>
              </Button>
            </div>

            <input
              id="workout-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              id="workout-file-input"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {imageFile && (
              <Button
                onClick={handleAnalyze}
                className="w-full bg-orange-500 hover:bg-orange-600"
              >
                נתח תמונה
              </Button>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-orange-500 animate-spin" />
            <p className="text-slate-600 font-medium">מזהה תרגילים...</p>
            <p className="text-sm text-slate-500">ה-AI קורא את התמונה</p>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800 font-medium">
                זוהו {detectedExercises.length} תרגילים
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">תרגילים שזוהו:</p>
              {detectedExercises.map((exercise, index) => (
                <Card key={index} className="p-3 flex items-center justify-between">
                  <span className="font-medium">{exercise.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExercise(index)}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </Card>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('upload')}
                className="flex-1"
              >
                צלם שוב
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={detectedExercises.length === 0}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                אישור והמשך
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}