import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function when(d) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Notifications() {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setChecking(false);
      if (session) load();
      else setLoading(false);
    }
    init();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setItems(data || []);
    setLoading(false);
    // Everything shown is now read. The bell updates on the next page change.
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
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
      <p className="text-sm font-semibold text-brand-600">Notifications</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Updates on your rooms</h1>
      <p className="mt-1 text-brand-900/70">We tell you here when a room is approved or needs changes.</p>

      <div className="mt-8 space-y-4">
        {loading && <p className="py-12 text-center text-brand-900/60">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">
            No updates yet. When an admin reviews your room, you will see it here.
          </p>
        )}

        {items.map((n) => {
          const rejected = n.kind === 'rejected';
          return (
            <article key={n.id}
              className={`rounded-2xl border p-5 shadow-sm ${
                n.is_read ? 'border-brand-100 bg-white' : 'border-brand-600 bg-brand-50'
              }`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                  rejected ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {rejected ? '!' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold">{n.title}</h2>
                    <span className="text-xs text-brand-900/50">{when(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-brand-900/80">{n.message}</p>

                  {rejected ? (
                    <Link to="/post-listing"
                          className="mt-3 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                      Post the room again
                    </Link>
                  ) : n.listing_id ? (
                    <Link to={`/listing/${n.listing_id}`}
                          className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-600">
                      View your room →
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}