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

// Quick reasons the admin can tap. The poster sees these in their notifications.
const REASONS = [
  'Photos are blurry or too dark',
  'Photos do not show the room clearly',
  'Exact address is incomplete',
  'WhatsApp number could not be reached',
  'Price does not look right',
  'This looks like a duplicate post',
];

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
  const [access, setAccess] = useState('checking');
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('pending');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // The rejection form: which listing is being rejected, and the reason typed
  const [rejecting, setRejecting] = useState(null);
  const [reasonPick, setReasonPick] = useState('');
  const [reasonNote, setReasonNote] = useState('');

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
    const [listRes, areaRes] = await Promise.all([
      supabase.rpc('admin_list_listings'),
      supabase.from('areas').select('id, name'),
    ]);
    if (listRes.error) {
      setNotice('Could not load listings: ' + listRes.error.message);
      setLoading(false);
      return;
    }
    const names = Object.fromEntries((areaRes.data || []).map((a) => [a.id, a.name]));
    setAll((listRes.data || []).map((l) => ({ ...l, areas: { name: names[l.area_id] } })));
    setLoading(false);
  }


  function startReject(item) {
    setRejecting(item);
    setReasonPick('');
    setReasonNote('');
  }

  function finalReason() {
    return [reasonPick, reasonNote.trim()].filter(Boolean).join(' — ');
  }

  // Approve, re-publish, or reject (reject always needs a reason)
  async function setStatus(item, newStatus, reason) {
    setBusyId(item.id);
    const changes = { status: newStatus };
    if (newStatus === 'ACTIVE') {
      changes.expires_at = new Date(Date.now() + 14 * DAY).toISOString();
      changes.rejection_reason = null;
    }
    if (newStatus === 'REJECTED') changes.rejection_reason = reason;

    const { data, error } = await supabase.from('listings').update(changes).eq('id', item.id).select('id');
    setBusyId(null);

    if (error) return setNotice('Error: ' + error.message);
    if (!data || data.length === 0) return setNotice('Nothing changed. The database blocked the update.');
    setNotice(newStatus === 'ACTIVE'
      ? `✅ "${item.title}" is live for 14 days. The poster has been notified.`
      : `"${item.title}" was rejected. The poster has been notified with the reason.`);
    fetchAll();
  }

  async function confirmReject() {
    const reason = finalReason();
    if (reason.length < 5) {
      return setNotice('Pick a reason or write one, so the poster knows what to fix.');
    }
    const item = rejecting;
    setRejecting(null);
    await setStatus(item, 'REJECTED', reason);
  }

  // Optional: also message the poster on WhatsApp with the reason filled in
  function whatsappReason(item) {
    const reason = finalReason() || 'please check your room details.';
    const msg = encodeURIComponent(
      `Hello, this is Abodified about your room "${item.title}". It was not approved yet because: ${reason} Please update it and post again. Thank you.`
    );
    window.open(`https://wa.me/${toWhatsApp(item.contact_number)}?text=${msg}`, '_blank', 'noopener');
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.title}" permanently?\n\nThis cannot be undone.`)) return;

    setBusyId(item.id);
    const { data, error } = await supabase.from('listings').delete().eq('id', item.id).select('id');
    setBusyId(null);

    if (error) return setNotice('Could not delete: ' + error.message);
    if (!data || data.length === 0) {
      return setNotice('Nothing was deleted. The database blocked it. Run the "Admins can delete listings" SQL first.');
    }

    try {
      const paths = [...new Set([item.photo_url, ...(item.photos || [])].map(photoPath).filter(Boolean))];
      if (paths.length) await supabase.storage.from('listing-photos').remove(paths);
    } catch (e) { /* not critical */ }

    setNotice(`🗑️ "${item.title}" was deleted.`);
    fetchAll();
  }

  // The reason panel that opens under a listing when rejecting it
  function renderRejectPanel(item) {
    if (rejecting?.id !== item.id) return null;
    return (
      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/40 p-4">
        <p className="text-sm font-bold text-red-700">Why is this being rejected?</p>
        <p className="text-xs text-brand-900/60">The poster will see this reason in their notifications.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReasonPick(reasonPick === r ? '' : r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                reasonPick === r ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-brand-900/80'
              }`}>
              {r}
            </button>
          ))}
        </div>

        <textarea rows={2} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)}
          placeholder="Add more detail (optional), e.g. the third photo is too dark"
          className="mt-3 w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600" />

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={confirmReject} disabled={busyId === item.id}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            Send rejection
          </button>
          <button type="button" onClick={() => whatsappReason(item)}
            className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            Also message poster on WhatsApp
          </button>
          <button type="button" onClick={() => setRejecting(null)}
            className="px-3 py-2 text-sm font-semibold text-brand-900/60 hover:text-brand-900">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const pending = useMemo(() => all.filter((l) => l.status === 'PENDING').reverse(), [all]);

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
      <p className="mt-1 text-brand-900/70">Approve new posts, reject them with a reason, or delete test and fake listings.</p>
      <Link to="/admin/reports" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-600">Student reports →</Link>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

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

                {renderRejectPanel(item)}

                {rejecting?.id !== item.id && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button disabled={busyId === item.id} onClick={() => setStatus(item, 'ACTIVE')} className={`${btn} bg-brand-700 text-white hover:bg-brand-600`}>Approve &amp; Publish</button>
                    <button disabled={busyId === item.id} onClick={() => startReject(item)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Reject…</button>
                    <button disabled={busyId === item.id} onClick={() => handleDelete(item)} className={`${btn} text-brand-900/60 hover:text-red-600`}>Delete</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
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
                <article key={item.id} className="rounded-2xl border border-brand-100 bg-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                      {st === 'REJECTED' && item.rejection_reason && (
                        <p className="mt-1 text-xs text-red-700">Reason sent: {item.rejection_reason}</p>
                      )}
                    </div>

                    {rejecting?.id !== item.id && (
                      <div className="flex flex-wrap gap-2">
                        {live && <Link to={`/listing/${item.id}`} className={`${btn} border border-brand-100 text-brand-700 hover:bg-brand-50`}>View</Link>}
                        {st !== 'ACTIVE' && (
                          <button disabled={busyId === item.id} onClick={() => setStatus(item, 'ACTIVE')} className={`${btn} bg-brand-700 text-white hover:bg-brand-600`}>
                            {st === 'PENDING' ? 'Approve' : 'Re-publish'}
                          </button>
                        )}
                        {st !== 'REJECTED' && (
                          <button disabled={busyId === item.id} onClick={() => startReject(item)} className={`${btn} border border-amber-200 text-amber-700 hover:bg-amber-50`}>Hide…</button>
                        )}
                        <button disabled={busyId === item.id} onClick={() => handleDelete(item)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Delete</button>
                      </div>
                    )}
                  </div>
                  {renderRejectPanel(item)}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}