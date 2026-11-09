import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows a recoverable error screen instead of a blank page when rendering crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="title-screen" data-focus-scope role="alert">
        <div className="logo" aria-hidden>🍂</div>
        <h1>Something went wrong</h1>
        <p className="muted">Your last autosave is safe. You can return to the title screen and continue from there.</p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <div className="title-actions">
          <button
            className="primary big"
            autoFocus
            onClick={() => {
              this.props.onReset();
              this.setState({ error: null });
            }}
          >
            Back to title
          </button>
          <button className="big" onClick={() => location.reload()}>Reload page</button>
        </div>
      </main>
    );
  }
}
