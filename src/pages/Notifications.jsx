import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toWhatsApp } from '../utils/helpers';
import { useConfirm } from '../components/ConfirmDialog';

const REJECT_REASONS = [
  'Photos are blurry or too dark',
  'Photos do not show the room clearly',
  'Exact address is incomplete',
  'WhatsApp number could not be reached',
  'Price does not look right',
  'This looks like a duplicate post',
];

const KIND = {
  approved: { icon: '✓', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { icon: '!', cls: 'bg-red-100 text-red-700' },
  expiring: { icon: '⏳', cls: 'bg-amber-100 text-amber-700' },
  report: { icon: '⚑', cls: 'bg-red-100 text-red-700' },
  message: { icon: '💬', cls: 'bg-sky-100 text-sky-700' },
  booking: { icon: '📅', cls: 'bg-amber-100 text-amber-700' },
};

function when(d) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function photoPath(url) {
  const marker = '/listing-photos/';
  const i = url ? url.indexOf(marker) : -1;
  return i > -1 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
}

export default function Notifications() {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [ask, dialog] = useConfirm();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      setChecking(false);
      if (!u) return setLoading(false);

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.id).single();
      const admin = prof?.role === 'admin';
      setIsAdmin(admin);
      if (admin) loadReports();
      loadItems();
    }
    init();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    setItems(data || []);
    setLoading(false);
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  }

  async function loadReports() {
    const { data, error } = await supabase
      .from('listing_reports')
      .select('*, listings(id, title, status, photo_url, photos, areas(name))')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) return setNotice('Could not load reports: ' + error.message);

    const map = new Map();
    (data || []).forEach((r) => {
      if (!r.listings) return;
      if (!map.has(r.listing_id)) map.set(r.listing_id, { listing: r.listings, reports: [] });
      map.get(r.listing_id).reports.push(r);
    });
    setGroups([...map.values()]);
  }

  async function resolveAll(listingId) {
    await supabase.from('listing_reports').update({ status: 'resolved' }).eq('listing_id', listingId).eq('status', 'open');
  }

  async function applyStatus(g, status, reason) {
    setBusy(g.listing.id);
    const { data, error } = await supabase
      .from('listings')
      .update({ status, rejection_reason: reason })
      .eq('id', g.listing.id)
      .select('id');
    if (error || !data?.length) {
      setBusy(null);
      return setNotice(error ? 'Error: ' + error.message : 'The database blocked the change.');
    }
    await resolveAll(g.listing.id);
    setBusy(null);
    setRejecting(null);
    setNotice(`"${g.listing.title}" was updated and the poster has been told.`);
    loadReports();
  }

  async function hide(g) {
    const ok = await ask({
      title: 'Hide this room?',
      message: `"${g.listing.title}" will be hidden from the site. The poster will be told it was reported.`,
      confirmText: 'Hide room',
      danger: true,
    });
    if (!ok) return;
    const reasons = [...new Set(g.reports.map((r) => r.reason))].join(', ');
    applyStatus(g, 'REJECTED', `Hidden after a student report: ${reasons}`);
  }

  function rejectWithReason(g) {
    const reason = [pick, note.trim()].filter(Boolean).join(' — ');
    if (reason.length < 5) return setNotice('Pick a reason or write one, so the poster knows what to fix.');
    applyStatus(g, 'REJECTED', reason);
  }

  async function dismiss(g) {
    await resolveAll(g.listing.id);
    setNotice(`Report dismissed. "${g.listing.title}" stays live.`);
    loadReports();
  }

  async function messageOwner(g) {
    const { data, error } = await supabase.rpc('get_listing_private', { p_listing_id: g.listing.id });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.contact_number) return setNotice('Could not get the owner’s number.');
    const reasons = [...new Set(g.reports.map((r) => r.reason))].join(', ');
    const msg = encodeURIComponent(
      `Hello, this is Abodified. Students reported your room "${g.listing.title}" for: ${reasons}. ` +
      `Please correct the listing, or mark it unavailable if it is taken, within 24 hours. Otherwise it will be hidden. Thank you.`
    );
    window.open(`https://wa.me/${toWhatsApp(row.contact_number)}?text=${msg}`, '_blank', 'noopener');
  }

  async function remove(g) {
    const ok = await ask({
      title: 'Delete this room?',
      message: `"${g.listing.title}" will be removed permanently. This cannot be undone.`,
      confirmText: 'Delete room',
      danger: true,
    });
    if (!ok) return;

    setBusy(g.listing.id);
    const { data, error } = await supabase.from('listings').delete().eq('id', g.listing.id).select('id');
    setBusy(null);
    if (error || !data?.length) {
      return setNotice(error ? 'Could not delete: ' + error.message : 'Nothing was deleted. Check the admin delete policy.');
    }
    try {
      const paths = [g.listing.photo_url, ...(g.listing.photos || [])].map(photoPath).filter(Boolean);
      if (paths.length) await supabase.storage.from('listing-photos').remove([...new Set(paths)]);
    } catch (e) { /* not critical */ }
    setNotice(`"${g.listing.title}" was deleted.`);
    loadReports();
  }

  if (checking) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Log in to see your notifications</h1>
        <Link to="/login" state={{ from: { pathname: location.pathname } }}
              className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {dialog}
      {notice && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      {isAdmin && (
        <section className="mb-12">
          <p className="text-sm font-semibold text-red-600">Admin</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Reports to review ({groups.length})</h2>
          <p className="mt-1 text-sm text-brand-900/70">Students flagged these rooms. Check the photos and details, then decide.</p>

          <div className="mt-6 space-y-4">
            {groups.length === 0 && (
              <p className="rounded-2xl border border-brand-100 bg-white p-8 text-center text-brand-900/60">No open reports. 🎉</p>
            )}

            {groups.map((g) => {
              const l = g.listing;
              const cover = l.photos?.[0] || l.photo_url;
              const working = busy === l.id;
              return (
                <article key={l.id} className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
                  <div className="flex gap-4">
                    <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                      {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold capitalize">{l.title}</h3>
                      <p className="text-xs text-brand-900/60">
                        {l.areas?.name} • status {l.status} • {g.reports.length} report{g.reports.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {g.reports.map((r) => (
                      <div key={r.id} className="rounded-xl bg-red-50 p-3">
                        <p className="text-sm font-bold text-red-700">{r.reason}</p>
                        <p className="text-sm text-brand-900/80">{r.message}</p>
                        <p className="mt-1 text-xs text-brand-900/50">{when(r.created_at)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/listing/${l.id}`}
                          className="rounded-lg border border-brand-100 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                      View room
                    </Link>
                    {l.status !== 'REJECTED' && (
                      <button disabled={working} onClick={() => hide(g)}
                              className="rounded-lg border border-amber-200 px-3.5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                        Hide room
                      </button>
                    )}
                    <button disabled={working}
                            onClick={() => { setRejecting(rejecting === l.id ? null : l.id); setPick(''); setNote(''); }}
                            className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      Reject with reason…
                    </button>
                    <button disabled={working} onClick={() => messageOwner(g)}
                            className="rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                      Message owner
                    </button>
                    <button disabled={working} onClick={() => dismiss(g)}
                            className="px-3 py-2 text-sm font-semibold text-brand-900/60 hover:text-brand-900 disabled:opacity-50">
                      Dismiss (room is fine)
                    </button>
                    <button disabled={working} onClick={() => remove(g)}
                            className="px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                      Delete
                    </button>
                  </div>

                  {rejecting === l.id && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-4">
                      <p className="text-sm font-bold text-red-700">Why is this being rejected?</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {REJECT_REASONS.map((r) => (
                          <button key={r} type="button" onClick={() => setPick(pick === r ? '' : r)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              pick === r ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-brand-900/80'
                            }`}>{r}</button>
                        ))}
                      </div>
                      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="Add more detail (optional)"
                        className="mt-3 w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600" />
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => rejectWithReason(g)} disabled={working}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                          Send rejection
                        </button>
                        <button type="button" onClick={() => setRejecting(null)}
                                className="px-3 py-2 text-sm font-semibold text-brand-900/60">Cancel</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-sm font-semibold text-brand-600">Notifications</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Updates</h1>

      <div className="mt-6 space-y-4">
        {loading && <p className="py-12 text-center text-brand-900/60">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">No updates yet.</p>
        )}

        {items.map((n) => {
          const k = KIND[n.kind] || KIND.approved;
          return (
            <article key={n.id}
              className={`rounded-2xl border p-5 shadow-sm ${n.is_read ? 'border-brand-100 bg-white' : 'border-brand-600 bg-brand-50'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${k.cls}`}>{k.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold">{n.title}</h2>
                    <span className="text-xs text-brand-900/50">{when(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-brand-900/80">{n.message}</p>

                  {n.kind === 'rejected' && (
                    <Link to="/my-listings" className="mt-3 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                      Fix it in My rooms
                    </Link>
                  )}
                  {n.kind === 'expiring' && (
                    <Link to="/my-listings" className="mt-3 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                      Reconfirm in My rooms
                    </Link>
                  )}
                  {n.kind === 'approved' && n.listing_id && (
                    <Link to={`/listing/${n.listing_id}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-600">
                      View your room →
                    </Link>
                  )}
                  {(n.kind === 'message' || n.kind === 'booking') && n.link && (
                    <Link to={n.link} className="mt-3 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                      {n.kind === 'booking' ? 'Open booking' : 'Open chat'}
                    </Link>
                  )}
                  {n.kind === 'report' && isAdmin && (
                    <p className="mt-2 text-xs font-semibold text-red-600">Review it in “Reports to review” above.</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}