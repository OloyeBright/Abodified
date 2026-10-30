import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toWhatsApp, formatTag, periodLabel } from '../utils/helpers';

const DAY = 24 * 60 * 60 * 1000;

const BADGE = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-200 text-gray-700',
};

// An ACTIVE listing whose date has passed is shown as EXPIRED
function shownStatus(item) {
  if (item.status === 'ACTIVE' && item.expires_at && new Date(item.expires_at) < new Date()) return 'EXPIRED';
  return item.status;
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

// Turns a public photo link into the file path inside the "listing-photos" bucket
function photoPath(url) {
  const marker = '/listing-photos/';
  const i = url ? url.indexOf(marker) : -1;
  return i > -1 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
}

function utilityTags(u) {
  if (Array.isArray(u)) return u;
  if (u && typeof u === 'object') return Object.keys(u).filter((k) => u[k] === true);
  return [];
}

export default function Admin() {
  const [access, setAccess] = useState('checking'); // checking | denied | admin
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('pending');         // pending | all
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setAccess('denied');
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (data?.role !== 'admin') return setAccess('denied');
      setAccess('admin');
      fetchAll();
    }
    init();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*, areas(name)')
      .order('created_at', { ascending: false });
    if (error) setNotice('Could not load listings: ' + error.message);
    else setAll(data || []);
    setLoading(false);
  }

  // Approve, re-publish or reject
  async function setStatus(item, newStatus) {
    if (newStatus === 'REJECTED' && !window.confirm(`Reject "${item.title}"? It will disappear from the site.`)) return;

    setBusyId(item.id);
    const changes = { status: newStatus };
    // Approved listings stay live for 14 days FROM APPROVAL
    if (newStatus === 'ACTIVE') changes.expires_at = new Date(Date.now() + 14 * DAY).toISOString();

    const { data, error } = await supabase.from('listings').update(changes).eq('id', item.id).select('id');
    setBusyId(null);

    if (error) return setNotice('Error: ' + error.message);
    if (!data || data.length === 0) return setNotice('Nothing changed. The database blocked the update.');
    setNotice(newStatus === 'ACTIVE' ? `✅ "${item.title}" is live for 14 days.` : `"${item.title}" was rejected and is now hidden.`);
    fetchAll();
  }

  // Delete for good (listing row + its photo files)
  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.title}" permanently?\n\nThis cannot be undone.`)) return;

    setBusyId(item.id);
    const { data, error } = await supabase.from('listings').delete().eq('id', item.id).select('id');
    setBusyId(null);

    if (error) return setNotice('Could not delete: ' + error.message);
    if (!data || data.length === 0) {
      return setNotice('Nothing was deleted. The database blocked it. Run the "Admins can delete listings" SQL first.');
    }

    // Best effort: remove the photo files too (ignored if it fails)
    try {
      const paths = [...new Set([item.photo_url, ...(item.photos || [])].map(photoPath).filter(Boolean))];
      if (paths.length) await supabase.storage.from('listing-photos').remove(paths);
    } catch (e) { /* not critical */ }

    setNotice(`🗑️ "${item.title}" was deleted.`);
    fetchAll();
  }

  const pending = useMemo(() => all.filter((l) => l.status === 'PENDING').reverse(), [all]); // oldest first

  const counts = useMemo(() => {
    const c = { ALL: all.length, ACTIVE: 0, PENDING: 0, REJECTED: 0, EXPIRED: 0 };
    all.forEach((l) => { c[shownStatus(l)] = (c[shownStatus(l)] || 0) + 1; });
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((l) => {
      if (filter !== 'ALL' && shownStatus(l) !== filter) return false;
      if (q && !(l.title.toLowerCase().includes(q) || (l.areas?.name || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [all, filter, search]);

  if (access === 'checking') return <p className="py-24 text-center text-brand-900/60">Checking access…</p>;

  if (access === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <p className="mt-2 text-brand-900/70">You need an admin account to see this page.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Go home</Link>
      </div>
    );
  }

  const btn = 'rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-semibold text-brand-600">Admin</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Manage listings</h1>
      <p className="mt-1 text-brand-900/70">Approve new posts, hide bad ones, or delete test and fake listings.</p>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-brand-100">
        {[['pending', `Pending (${pending.length})`], ['all', `All listings (${all.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === key ? 'border-brand-700 text-brand-700' : 'border-transparent text-brand-900/60 hover:text-brand-900'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-brand-900/60">Loading…</p>
      ) : tab === 'pending' ? (
        /* ---------------- PENDING TAB ---------------- */
        <div className="mt-6 space-y-6">
          {pending.length === 0 && (
            <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">🎉 Nothing waiting for review.</p>
          )}
          {pending.map((item) => {
            const imgs = item.photos?.length ? item.photos : item.photo_url ? [item.photo_url] : [];
            const tags = utilityTags(item.utilities);
            return (
              <article key={item.id} className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold capitalize">{item.title}</h2>
                    <p className="text-sm text-brand-900/60">{item.accommodation_type} • {item.rooms} room • {item.areas?.name} • posted {fmtDate(item.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE.PENDING}`}>PENDING</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {imgs.slice(0, 8).map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noreferrer" className="block h-28 overflow-hidden rounded-xl bg-brand-50">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                  {imgs.length === 0 && <p className="text-sm text-brand-900/50">No photos</p>}
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="inline font-semibold">Rent: </dt><dd className="inline">₦{Number(item.rent_amount).toLocaleString()} / {periodLabel[item.rent_period] || item.rent_period}</dd></div>
                  <div><dt className="inline font-semibold">Exact address: </dt><dd className="inline">{item.exact_address || '—'}</dd></div>
                  <div><dt className="inline font-semibold">WhatsApp: </dt>
                    <dd className="inline">{item.contact_number}{' '}
                      <a href={`https://wa.me/${toWhatsApp(item.contact_number)}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">test</a>
                    </dd></div>
                  <div><dt className="inline font-semibold">Includes: </dt><dd className="inline">{tags.length ? tags.map(formatTag).join(', ') : '—'}</dd></div>
                </dl>
                {item.description && <p className="mt-3 text-sm text-brand-900/80">{item.description}</p>}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button disabled={busyId === item.id} onClick={() => setStatus(item, 'ACTIVE')} className={`${btn} bg-brand-700 text-white hover:bg-brand-600`}>Approve &amp; Publish</button>
                  <button disabled={busyId === item.id} onClick={() => setStatus(item, 'REJECTED')} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Reject</button>
                  <button disabled={busyId === item.id} onClick={() => handleDelete(item)} className={`${btn} text-brand-900/60 hover:text-red-600`}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* ---------------- ALL LISTINGS TAB ---------------- */
        <div className="mt-6">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or area…"
                 className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm outline-none focus:border-brand-600" />

          <div className="mt-3 flex flex-wrap gap-2">
            {['ALL', 'ACTIVE', 'PENDING', 'REJECTED', 'EXPIRED'].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  filter === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-100 bg-white text-brand-900/70 hover:border-brand-600'
                }`}>
                {s} ({counts[s] || 0})
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {visible.length === 0 && (
              <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">No listings match.</p>
            )}
            {visible.map((item) => {
              const st = shownStatus(item);
              const cover = item.photos?.[0] || item.photo_url;
              const live = st === 'ACTIVE';
              return (
                <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-brand-100 bg-white p-4 sm:flex-row sm:items-center">
                  <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-brand-50 sm:h-20 sm:w-28">
                    {cover && <img src={cover} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold capitalize">{item.title}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[st] || BADGE.EXPIRED}`}>{st}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-brand-900/60">
                      #{item.id} • {item.areas?.name} • ₦{Number(item.rent_amount).toLocaleString()} / {periodLabel[item.rent_period] || item.rent_period}
                    </p>
                    <p className="text-xs text-brand-900/50">
                      Posted {fmtDate(item.created_at)}{item.status === 'ACTIVE' && ` • ${st === 'EXPIRED' ? 'Expired' : 'Expires'} ${fmtDate(item.expires_at)}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {live && <Link to={`/listing/${item.id}`} className={`${btn} border border-brand-100 text-brand-700 hover:bg-brand-50`}>View</Link>}
                    {st !== 'ACTIVE' && (
                      <button disabled={busyId === item.id} onClick={() => setStatus(item, 'ACTIVE')} className={`${btn} bg-brand-700 text-white hover:bg-brand-600`}>
                        {st === 'PENDING' ? 'Approve' : 'Re-publish'}
                      </button>
                    )}
                    {st !== 'REJECTED' && (
                      <button disabled={busyId === item.id} onClick={() => setStatus(item, 'REJECTED')} className={`${btn} border border-amber-200 text-amber-700 hover:bg-amber-50`}>Hide</button>
                    )}
                    <button disabled={busyId === item.id} onClick={() => handleDelete(item)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}