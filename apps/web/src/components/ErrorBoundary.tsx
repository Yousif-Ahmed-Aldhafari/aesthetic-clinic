import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: { error: Error; errorId: string; retry: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const correlationId = this.state.errorId ?? 'ERR-UNKNOWN';
    // Log structured error without leaking personal data
    console.error('[Lamssa:ErrorBoundary]', {
      correlationId,
      message: error?.message,
      componentStack: errorInfo?.componentStack,
    });
  }

  retry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const errorId = this.state.errorId ?? 'ERR-UNKNOWN';

      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorId,
          retry: this.retry,
        });
      }

      return (
        <div
          dir="rtl"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: '#f6f8fc',
            fontFamily: "'Cairo', Tahoma, Arial, sans-serif",
            color: '#20243b',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #eef0f5',
              boxShadow: '0 10px 30px rgba(23, 16, 36, 0.08)',
              padding: '32px 28px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: '#fff1e8',
                color: '#ed9850',
                display: 'grid',
                placeItems: 'center',
                fontSize: '28px',
                margin: '0 auto 20px',
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#252640',
                margin: '0 0 10px',
              }}
            >
              حدث خطأ غير متوقع
            </h1>

            <p
              style={{
                fontSize: '13px',
                lineHeight: 1.8,
                color: '#74798c',
                margin: '0 0 20px',
              }}
            >
              نعتذر عن هذا الخطأ المؤقت. تم تسجيل تفاصيل المشكلة برمز التتبع الموضح أدناه للمساعدة في التحقق منها فورًا.
            </p>

            <div
              style={{
                display: 'inline-block',
                background: '#f1ecfe',
                color: '#7048d4',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                direction: 'ltr',
                marginBottom: '24px',
                userSelect: 'all',
              }}
            >
              {errorId}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                onClick={this.retry}
                style={{
                  border: 0,
                  background: '#7854d9',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(120, 84, 217, 0.25)',
                }}
              >
                إعادة المحاولة
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                style={{
                  border: '1px solid #dde1ea',
                  background: '#ffffff',
                  color: '#54576a',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
