import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function fmt(d) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminReports() {
  const [access, setAccess] = useState('checking');
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('open');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setAccess('denied');
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (data?.role !== 'admin') return setAccess('denied');
      setAccess('admin');
      load();
    }
    init();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from('listing_reports')
      .select('*, listings(id, title, status, photo_url, photos, areas(name))')
      .order('created_at', { ascending: false });
    if (error) setNotice('Could not load reports: ' + error.message);
    else setReports(data || []);
  }

  // Hide the room from the site. The poster is notified with the reason.
  async function hideRoom(r) {
    if (!window.confirm(`Hide "${r.listings?.title}" from the site? The poster will be told it was reported.`)) return;
    setBusy(r.id);
    const { data, error } = await supabase
      .from('listings')
      .update({ status: 'REJECTED', rejection_reason: `Reported by a student: ${r.reason}` })
      .eq('id', r.listing_id)
      .select('id');
    if (error || !data?.length) {
      setBusy(null);
      return setNotice(error ? 'Error: ' + error.message : 'The database blocked the change.');
    }
    await supabase.from('listing_reports').update({ status: 'resolved' }).eq('id', r.id);
    setBusy(null);
    setNotice(`"${r.listings?.title}" is hidden and the poster has been told.`);
    load();
  }

  async function setResolved(r, status) {
    setBusy(r.id);
    const { error } = await supabase.from('listing_reports').update({ status }).eq('id', r.id);
    setBusy(null);
    if (error) return setNotice('Error: ' + error.message);
    load();
  }

  if (access === 'checking') return <p className="py-24 text-center text-brand-900/60">Checking access…</p>;
  if (access === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Go home</Link>
      </div>
    );
  }

  const openCount = reports.filter((r) => r.status === 'open').length;
  const shown = reports.filter((r) => (tab === 'open' ? r.status === 'open' : r.status === 'resolved'));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/admin" className="text-sm font-semibold text-brand-700 hover:text-brand-600">← Back to listings</Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Student reports</h1>
      <p className="mt-1 text-brand-900/70">Rooms that students reported. Check each one before you decide.</p>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      <div className="mt-6 flex gap-2 border-b border-brand-100">
        {[['open', `Open (${openCount})`], ['resolved', `Resolved (${reports.length - openCount})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === key ? 'border-brand-700 text-brand-700' : 'border-transparent text-brand-900/60 hover:text-brand-900'
            }`}>{label}</button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {shown.length === 0 && (
          <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">
            {tab === 'open' ? 'No open reports. 🎉' : 'No resolved reports yet.'}
          </p>
        )}

        {shown.map((r) => {
          const l = r.listings;
          const cover = l?.photos?.[0] || l?.photo_url;
          const live = l?.status === 'ACTIVE';
          return (
            <article key={r.id} className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
              <div className="flex gap-4">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                  {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold capitalize">{l?.title || 'Deleted listing'}</h2>
                    <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[11px] font-bold text-gray-700">{l?.status || 'gone'}</span>
                  </div>
                  <p className="text-xs text-brand-900/60">{l?.areas?.name} • reported {fmt(r.created_at)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-red-50 p-4">
                <p className="text-sm font-bold text-red-700">{r.reason}</p>
                <p className="mt-1 text-sm text-brand-900/80">{r.message}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {live && <Link to={`/listing/${r.listing_id}`} className="rounded-lg border border-brand-100 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">View room</Link>}
                {r.status === 'open' && live && (
                  <button disabled={busy === r.id} onClick={() => hideRoom(r)}
                    className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Hide room</button>
                )}
                {r.status === 'open' ? (
                  <button disabled={busy === r.id} onClick={() => setResolved(r, 'resolved')}
                    className="rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">Dismiss (room is fine)</button>
                ) : (
                  <button disabled={busy === r.id} onClick={() => setResolved(r, 'open')}
                    className="rounded-lg border border-brand-100 px-3.5 py-2 text-sm font-semibold text-brand-900/70 hover:bg-brand-50 disabled:opacity-50">Reopen</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}