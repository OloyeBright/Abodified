import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sha256Hex } from '../utils/helpers';

const inputClass = 'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

export default function Verify() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [file, setFile] = useState(null);
  const [idNumber, setIdNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) await load(u.id);
      setChecking(false);
    }
    init();
  }, []);

  async function load(uid) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('profile_locked_at, account_type, verified_until')
      .eq('id', uid)
      .maybeSingle();
    setProfile(prof || null);

    const { data: rows } = await supabase
      .from('verifications')
      .select('id, status, created_at, reviewed_at, admin_note')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setHistory(rows || []);
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setNotice('Please choose a photo or PDF of your ID.');
    if (file.size > 8 * 1024 * 1024) return setNotice('The ID file must be under 8MB.');
    if (idNumber.replace(/\s/g, '').length < 6) return setNotice('Enter your ID number.');
    if (!consent) return setNotice('Please tick the box to agree.');

    setBusy(true);
    setNotice('');
    const docHash = await sha256Hex(file);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}-id.${ext}`;

    const { error: upErr } = await supabase.storage.from('identity-docs').upload(path, file, { contentType: file.type });
    if (upErr) {
      setBusy(false);
      return setNotice('Upload failed: ' + upErr.message);
    }

    const { error } = await supabase.rpc('submit_identity', {
      p_document_path: path,
      p_document_hash: docHash,
      p_id_number: idNumber,
    });
    setBusy(false);
    if (error) return setNotice(error.message);

    setFile(null);
    setIdNumber('');
    setConsent(false);
    setNotice('Sent. An admin will check it. Your ID document is deleted 30 days after the decision.');
    load(user.id);
  }

  if (checking) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Log in to verify your identity</h1>
        <Link to="/login" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Log in</Link>
      </div>
    );
  }

  if (!profile?.profile_locked_at) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Save your profile first</h1>
        <Link to="/settings" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Set up my profile</Link>
      </div>
    );
  }

  if (profile.account_type !== 'LANDLORD') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Only landlord accounts need this</h1>
        <p className="mt-2 text-base text-brand-900/75">Students do not post rooms, so there is nothing to verify.</p>
      </div>
    );
  }

  const verified = profile.verified_until && new Date(profile.verified_until) > new Date();
  const pending = history.some((h) => h.status === 'PENDING');

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <Link to="/post-listing" className="text-sm font-semibold text-brand-700">← Back to Post a Room</Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Verify your identity</h1>
      <p className="mt-2 text-base text-brand-900/75">
        Landlords verify once every 12 months before posting. Each room also needs its own proof of ownership.
      </p>

      {verified && (
        <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          ✅ Your identity is verified until {new Date(profile.verified_until).toLocaleDateString('en-GB')}.
        </div>
      )}

      {!verified && !pending && (
        <form onSubmit={submit} className="mt-6 space-y-5 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold">Your ID document <span className="font-normal text-brand-900/50">(NIN slip, national ID or international passport)</span></p>
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl bg-brand-700 px-5 py-4 text-center font-bold text-white hover:bg-brand-600">
              {file ? `✓ ${file.name}` : 'Tap here to choose your ID'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
          </div>

          <label className="block text-sm font-semibold">Your ID number
            <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. your NIN or passport number" className={inputClass} />
          </label>
          <p className="text-xs text-brand-900/60">The ID number is stored only as a fingerprint. The document is kept privately and deleted 30 days after the decision.</p>

          <label className="flex items-start gap-3 rounded-xl border border-brand-100 p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />
            <span>I agree that an admin will check this document to confirm my identity, and that it will be deleted 30 days after the decision.</span>
          </label>

          <button type="submit" disabled={busy}
                  className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {busy ? 'Sending…' : 'Send for checking'}
          </button>
        </form>
      )}

      {pending && !verified && (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900">
          Your identity check is waiting for an admin. You will see the result here.
        </div>
      )}

      {notice && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">{notice}</p>}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold">Your checks</h2>
          <div className="mt-3 space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-brand-100 bg-white p-4">
                <p className="text-sm font-semibold">
                  {h.status === 'APPROVED' ? 'Approved' : h.status === 'REJECTED' ? 'Not approved' : 'Waiting for review'}
                  <span className="ml-2 font-normal text-brand-900/60">sent {new Date(h.created_at).toLocaleDateString('en-GB')}</span>
                </p>
                {h.admin_note && <p className="mt-1 text-sm text-brand-900/75">Note: {h.admin_note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}