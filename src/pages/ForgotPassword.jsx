import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    // Supabase emails a link. redirectTo is the page that link opens.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) setErrorMsg(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-brand-900/70">Enter your email and we’ll send you a link to choose a new password.</p>

        {sent ? (
          <div className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox and your spam folder.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-semibold">Email</label>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@example.com"
                     className="mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600" />
            </div>
            {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
            <button type="submit" disabled={loading}
                    className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="font-semibold text-brand-600">← Back to log in</Link>
        </p>
      </div>
    </div>
  );
}