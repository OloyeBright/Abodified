import { Component } from 'react';

// Catches a crash on any page and shows a friendly message instead of a blank screen.
// App.jsx gives this component a new key on every page change, so it resets when you move on.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-2xl font-extrabold">Something went wrong</h1>
          <p className="mt-2 text-base text-brand-900/75">
            This page had a problem. Please try again, or go back to the home page.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-xl border border-brand-100 px-6 py-3 font-semibold text-brand-700 hover:bg-brand-50"
            >
              Go home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}