import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default class HomeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      correlationId: this.generateCorrelationId()
    };
  }

  generateCorrelationId() {
    return `HME-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HomeErrorBoundary]', this.state.correlationId, error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  copyErrorReport = () => {
    const report = {
      correlationId: this.state.correlationId,
      timestamp: new Date().toISOString(),
      error: this.state.error?.toString(),
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack
    };
    
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('דוח שגיאה הועתק ללוח');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
          <Card className="max-w-lg w-full p-6 border-2 border-red-300">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">
                אופס! משהו השתבש
              </h2>
              <p className="text-sm text-slate-600 mb-3">
                אירעה שגיאה בלתי צפויה בטעינת הדף
              </p>
              <div className="bg-slate-100 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-1">מזהה שגיאה:</p>
                <p className="text-sm font-mono text-slate-800">{this.state.correlationId}</p>
              </div>
            </div>

            {this.state.error && (
              <details className="mb-4">
                <summary className="text-sm text-slate-600 cursor-pointer mb-2">
                  פרטי שגיאה טכניים
                </summary>
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs">
                  <p className="font-mono text-red-800 mb-2">{this.state.error.toString()}</p>
                  {this.state.error.stack && (
                    <pre className="text-red-700 overflow-x-auto text-[10px]">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <div className="space-y-2">
              <Button
                onClick={() => window.location.reload()}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                רענן דף
              </Button>
              <Button
                onClick={this.copyErrorReport}
                variant="outline"
                className="w-full"
              >
                <Copy className="w-4 h-4 mr-2" />
                העתק דוח שגיאה
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}