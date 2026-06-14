import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Copy, Home } from 'lucide-react';
import { createPageUrl } from '@/utils';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      lastRoute: '',
      errorTime: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorDetails = {
      error,
      errorInfo,
      lastRoute: window.location.pathname,
      errorTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };

    console.error('ErrorBoundary caught error:', errorDetails);
    
    this.setState({
      error,
      errorInfo,
      lastRoute: window.location.pathname,
      errorTime: new Date().toISOString(),
    });

    // Log to server/analytics if available
    try {
      localStorage.setItem('lastCrash', JSON.stringify({
        message: error.toString(),
        stack: error.stack,
        route: window.location.pathname,
        time: new Date().toISOString(),
        userAgent: navigator.userAgent,
      }));
    } catch (e) {
      console.error('Failed to log crash:', e);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = createPageUrl('TraineeHome');
  };

  handleCopyReport = () => {
    const report = `
דוח תקלה - FIT COACH PRO
=========================
זמן: ${this.state.errorTime}
נתיב: ${this.state.lastRoute}
שגיאה: ${this.state.error?.toString()}

Stack Trace:
${this.state.error?.stack || 'לא זמין'}

Component Stack:
${this.state.errorInfo?.componentStack || 'לא זמין'}

מכשיר: ${navigator.userAgent}
מסך: ${window.innerWidth}x${window.innerHeight}
    `.trim();

    navigator.clipboard.writeText(report).then(() => {
      alert('דוח התקלה הועתק ללוח');
    }).catch(() => {
      alert('לא ניתן להעתיק. נסה שוב.');
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4" dir="rtl">
          <Card className="max-w-lg w-full p-6 border-2 border-red-200 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-10 h-10 text-red-500" />
              <div>
                <h1 className="text-2xl font-bold text-slate-800">התרחשה תקלה</h1>
                <p className="text-sm text-slate-600">האפליקציה נתקלה בבעיה ולא הצליחה להמשיך</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-red-900 mb-2">פרטי השגיאה:</p>
              <p className="text-xs text-red-700 font-mono break-all">
                {this.state.error?.toString() || 'שגיאה לא ידועה'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-xs text-slate-600">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-medium">זמן:</span>
                  <br />
                  {new Date(this.state.errorTime).toLocaleString('he-IL')}
                </div>
                <div>
                  <span className="font-medium">נתיב:</span>
                  <br />
                  {this.state.lastRoute || 'לא זמין'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={this.handleReload}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4 ml-2" />
                רענן את האפליקציה
              </Button>

              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="w-full"
              >
                <Home className="w-4 h-4 ml-2" />
                חזור לדף הבית
              </Button>

              <Button
                onClick={this.handleCopyReport}
                variant="outline"
                className="w-full text-slate-600"
              >
                <Copy className="w-4 h-4 ml-2" />
                העתק דוח תקלה
              </Button>
            </div>

            <p className="text-xs text-center text-slate-500 mt-4">
              אם הבעיה חוזרת, העתק את דוח התקלה ושלח למאמן שלך
            </p>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;