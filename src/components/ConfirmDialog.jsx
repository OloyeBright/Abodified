import { useState, useRef, useCallback } from 'react';

// Use: const [ask, dialog] = useConfirm();   then   const ok = await ask({ title, message, confirmText, danger });
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const ask = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve;
    setState({
      title: 'Are you sure?',
      message: '',
      confirmText: 'Yes, continue',
      cancelText: 'Cancel',
      danger: false,
      ...opts,
    });
  }), []);

  function answer(ok) {
    if (resolver.current) resolver.current(ok);
    resolver.current = null;
    setState(null);
  }

  const dialog = state ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-950/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${state.danger ? 'bg-red-100' : 'bg-brand-50'}`}>
          {state.danger ? '⚠' : '✓'}
        </div>
        <h2 className="text-xl font-extrabold">{state.title}</h2>
        {state.message && <p className="mt-2 whitespace-pre-line text-base text-brand-900/75">{state.message}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => answer(false)}
                  className="rounded-xl border border-brand-100 px-5 py-2.5 text-sm font-semibold text-brand-900/80 hover:bg-brand-50">
            {state.cancelText}
          </button>
          <button type="button" onClick={() => answer(true)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
                    state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-600'
                  }`}>
            {state.confirmText}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [ask, dialog];
}