import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setInfo('');
    if (password.length < 6) return setErrorMsg('Password must be at least 6 characters.');
    if (password !== confirm) return setErrorMsg('The two passwords do not match.');

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setLoading(false);

    if (error) return setErrorMsg(error.message);
    if (!data.session) setInfo('Account created! Check your email to confirm it, then log in.');
    else navigate(from, { replace: true });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-brand-100 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-brand-900/70">Join Abodified to find or post a room.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-semibold">Full name</label>
            <input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                   placeholder="e.g. Adebayo Tunde" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold">Email</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@example.com" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold">Password</label>
            <input type="password" required autoComplete="new-password" value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   placeholder="At least 6 characters" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold">Confirm password</label>
            <input type="password" required autoComplete="new-password" value={confirm}
                   onChange={(e) => setConfirm(e.target.value)}
                   placeholder="Type the password again" className={inputClass} />
          </div>

          {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
          {info && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{info}</p>}

          <button type="submit" disabled={loading}
                  className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {loading ? 'Creating…' : 'Sign up'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-900/70">
          Already have an account? <Link to="/login" state={location.state} className="font-semibold text-brand-600">Log in</Link>
        </p>
      </div>
    </div>
  );
}