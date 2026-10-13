import { Component } from 'react';

// If a page crashes while rendering, React normally wipes the WHOLE screen (blank page).
// This catches the crash, shows the real error message, and gives a way back.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-box">
        <h1 style={{ fontSize: 24, margin: 0 }}>This page hit a problem</h1>
        <p style={{ color: '#667570', fontSize: 13, marginTop: 8 }}>
          Your other pages are fine. Screenshot this message and send it to get it fixed:
        </p>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <a href="/" className="btn btn--secondary">Back to home</a>
      </div>
    );
  }
}