import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toWhatsApp, formatTag, periodLabel } from '../utils/helpers';

export default function Admin() {
  const [access, setAccess] = useState('checking'); // checking | denied | admin
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setAccess('denied');

      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (data?.role !== 'admin') return setAccess('denied');

      setAccess('admin');
      fetchPending();
    }
    init();
  }, []);

  async function fetchPending() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*, areas(name)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    if (error) setNotice('Could not load listings: ' + error.message);
    else setPending(data || []);
    setLoading(false);
  }

  async function handleStatusUpdate(item, newStatus) {
    if (newStatus === 'REJECTED' && !window.confirm(`Reject "${item.title}"?`)) return;

    const changes = { status: newStatus };
    // Approved listings stay live for 14 days FROM APPROVAL (PRD 8.1)
    if (newStatus === 'ACTIVE') {
      changes.expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { error } = await supabase.from('listings').update(changes).eq('id', item.id);
    if (error) return setNotice('Error: ' + error.message);

    setNotice(newStatus === 'ACTIVE' ? `✅ "${item.title}" is now live for 14 days.` : `"${item.title}" was rejected.`);
    fetchPending();
  }

  if (access === 'checking') return <p className="py-24 text-center text-brand-900/60">Checking access…</p>;

  if (access === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <p className="mt-2 text-brand-900/70">You need an admin account to see this page.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-semibold text-brand-600">Moderation</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
        Pending listings <span className="text-brand-900/40">({pending.length})</span>
      </h1>
      <p className="mt-1 text-brand-900/70">Check the photos, address and WhatsApp number, then approve or reject.</p>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {loading ? (
          <p className="py-12 text-center text-brand-900/60">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">
            🎉 Nothing waiting for review.
          </p>
        ) : (
          pending.map((item) => {
            const imgs = item.photos?.length ? item.photos : item.photo_url ? [item.photo_url] : [];
            const tags = item.utilities && typeof item.utilities === 'object' && !Array.isArray(item.utilities)
              ? Object.keys(item.utilities).filter((k) => item.utilities[k] === true)
              : Array.isArray(item.utilities) ? item.utilities : [];

            return (
              <article key={item.id} className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold capitalize">{item.title}</h2>
                    <p className="text-sm text-brand-900/60">
                      {item.accommodation_type} • {item.rooms} room • {item.areas?.name}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">PENDING</span>
                </div>

                {/* Photos: click one to open it full size */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {imgs.slice(0, 8).map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noreferrer"
                       className="block h-28 overflow-hidden rounded-xl bg-brand-50">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                  {imgs.length === 0 && <p className="text-sm text-brand-900/50">No photos</p>}
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="inline font-semibold">Rent: </dt>
                    <dd className="inline">₦{Number(item.rent_amount).toLocaleString()} / {periodLabel[item.rent_period] || item.rent_period}</dd></div>
                  <div><dt className="inline font-semibold">Exact address: </dt><dd className="inline">{item.exact_address || '—'}</dd></div>
                  <div><dt className="inline font-semibold">WhatsApp: </dt>
                    <dd className="inline">{item.contact_number}{' '}
                      <a href={`https://wa.me/${toWhatsApp(item.contact_number)}`} target="_blank" rel="noreferrer"
                         className="font-semibold text-brand-600 underline">test</a></dd></div>
                  <div><dt className="inline font-semibold">Includes: </dt>
                    <dd className="inline">{tags.length ? tags.map(formatTag).join(', ') : '—'}</dd></div>
                </dl>
                {item.description && <p className="mt-3 text-sm text-brand-900/80">{item.description}</p>}

                <div className="mt-5 flex gap-3">
                  <button onClick={() => handleStatusUpdate(item, 'ACTIVE')}
                          className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                    Approve &amp; Publish
                  </button>
                  <button onClick={() => handleStatusUpdate(item, 'REJECTED')}
                          className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                    Reject
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}