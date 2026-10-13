import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  // The email link logs the user in "in recovery mode". We wait for that.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 6) return setErrorMsg('Password must be at least 6 characters.');
    if (password !== confirm) return setErrorMsg('The two passwords do not match.');

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) return setErrorMsg(error.message);
    setDone(true);
    setTimeout(() => navigate('/'), 2000);
  }

  const inputClass =
    'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight">Choose a new password</h1>

        {done ? (
          <p className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
            ✅ Password updated. Taking you home…
          </p>
        ) : !ready ? (
          <div className="mt-6 text-sm text-brand-900/70">
            <p>This page works from the link in your reset email. If you opened it directly, request a new link.</p>
            <Link to="/forgot-password" className="mt-4 inline-block font-semibold text-brand-600">Request a reset link</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-semibold">New password</label>
              <input type="password" required autoComplete="new-password" value={password}
                     onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputClass} />
            </div>
            <div>
              <label className="text-sm font-semibold">Confirm new password</label>
              <input type="password" required autoComplete="new-password" value={confirm}
                     onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" className={inputClass} />
            </div>
            {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
            <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}