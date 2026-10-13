import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setErrorMsg(error.message);
    else navigate('/');
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-brand-900/70">Log in to chat with owners or manage your rooms.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-semibold">Email</label>
            <input type="email" required autoComplete="email" value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@example.com" className={inputClass} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Password</label>
              <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required autoComplete="current-password" value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="Enter your password" className={inputClass + ' pr-16'} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-700">
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}

          <button type="submit" disabled={loading}
                  className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-900/70">
          New here? <Link to="/signup" state={location.state} className="font-semibold text-brand-600">Create an account</Link>
        </p>
      </div>
    </div>
  );
}