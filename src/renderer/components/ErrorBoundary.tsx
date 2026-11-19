import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown } from 'lucide-react';

interface Props {
  children: ReactNode;
  moduleName?: string;
  onReset?: () => void;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[MODULE ERROR BOUNDARY: ${this.props.moduleName || 'App'}]`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onNavigateHome) {
      this.props.onNavigateHome();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 w-full min-h-[360px] flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg text-center animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto mb-3.5">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {this.props.moduleName
                ? `Module Notice: ${this.props.moduleName}`
                : 'Interface Notice'}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              An unexpected display issue occurred in this section. Your data is safely stored in the
              database and has not been affected.
            </p>

            {this.state.error && (
              <div className="mt-3 text-left">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 flex items-center space-x-1 mx-auto"
                >
                  <span>{this.state.showDetails ? 'Hide Diagnostics' : 'Show Diagnostics'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`} />
                </button>

                {this.state.showDetails && (
                  <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-36">
                    <p className="font-semibold text-rose-600 dark:text-rose-400">{this.state.error.message}</p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="mt-1 text-[10px] text-slate-400">{this.state.errorInfo.componentStack.trim()}</pre>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-center space-x-2.5">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center space-x-1.5 shadow-2xs transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Section</span>
              </button>

              {this.props.onNavigateHome && (
                <button
                  type="button"
                  onClick={this.handleHome}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Return to Dashboard</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
