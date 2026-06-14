import React from 'react';

class ShapeLeagueSectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ShapeLeague Section Error] ${this.props.name}:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-500/40 rounded-2xl p-4 mb-4" dir="rtl">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div>
              <h3 className="text-red-400 font-semibold text-sm">{this.props.name} crashed</h3>
              <p className="text-red-300/70 text-xs mt-1">{this.state.error?.message}</p>
              <p className="text-red-300/50 text-xs mt-2 font-mono">{this.state.error?.toString().slice(0, 100)}</p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="mt-2 text-xs bg-red-600/40 hover:bg-red-600/60 text-red-200 px-2 py-1 rounded transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ShapeLeagueSafeSection({ name, children, disabled = false }) {
  // Check if this section is disabled via debug flags
  const isDisabled = disabled || (typeof localStorage !== 'undefined' && 
    JSON.parse(localStorage.getItem('shape_league_disabled_modules') || '{}')[name]);

  if (isDisabled) {
    return (
      <div className="bg-slate-800/50 border border-dashed border-slate-600 rounded-2xl p-4 mb-4 text-center" dir="rtl">
        <p className="text-slate-500 text-xs">
          {name} disabled (debug mode)
        </p>
      </div>
    );
  }

  return (
    <ShapeLeagueSectionErrorBoundary name={name}>
      {children}
    </ShapeLeagueSectionErrorBoundary>
  );
}