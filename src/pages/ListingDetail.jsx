import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toWhatsApp, formatTag, periodLabel, distanceKm, formatDistance } from '../utils/helpers';

// Captions for photos taken through the Post a Room form (same order as the form)
const CAPTIONS = ['Main room', 'Toilet & bathroom', 'Kitchen & water', 'Compound & outside'];

// NOTE: contact_number and exact_address are deliberately NOT selected here.
const DETAIL_COLUMNS =
  'id, title, description, accommodation_type, rooms, rent_amount, rent_period, utilities, photo_url, photos, areas(name, lat, lng)';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [user, setUser] = useState(null);
  const [contacting, setContacting] = useState(false);
  const [contactError, setContactError] = useState('');
  const [dist, setDist] = useState({ state: 'idle', km: null });
  const touchX = useRef(null); // where a finger touched down (for swiping)

  // 1. Load the listing (and who is logged in)
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      const { data } = await supabase
        .from('listings')
        .select(DETAIL_COLUMNS)
        .eq('id', id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      setListing(data || null);
      setActive(0);
      setLoading(false);
    }
    load();
  }, [id]);

  // 2. Ask the browser for the visitor's location, then measure the distance
  useEffect(() => {
    const lat = listing?.areas?.lat;
    const lng = listing?.areas?.lng;
    if (lat == null || lng == null) return;
    if (!('geolocation' in navigator)) return setDist({ state: 'unavailable', km: null });

    setDist({ state: 'loading', km: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => setDist({ state: 'ok', km: distanceKm(pos.coords.latitude, pos.coords.longitude, lat, lng) }),
      () => setDist({ state: 'denied', km: null }),
      { timeout: 10000 }
    );
  }, [listing]);

  // 3. Get the number from the database only when the button is clicked
  async function handleContact() {
    setContactError('');
    // Not logged in: go to login, and come back to THIS listing afterwards
    if (!user) return navigate('/login', { state: { from: { pathname: `/listing/${id}` } } });

    // Open the tab immediately (browsers block pop-ups opened after a wait)
    const tab = window.open('about:blank', '_blank');
    setContacting(true);
    const { data, error } = await supabase.rpc('get_listing_whatsapp', { p_listing_id: listing.id });
    setContacting(false);

    if (error || !data) {
      if (tab) tab.close();
      return setContactError('Could not open the chat. Please try again.');
    }

    const msg = encodeURIComponent(`Hello, I found "${listing.title}" on Abodified. Is it still available?`);
    const url = `https://wa.me/${toWhatsApp(data)}?text=${msg}`;
    if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  if (loading) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!listing) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">This room isn’t available</h1>
        <p className="mt-2 text-brand-900/70">It may have been taken, or the listing expired.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Browse other rooms
        </Link>
      </div>
    );
  }

  const photos = listing.photos?.length ? listing.photos : listing.photo_url ? [listing.photo_url] : [];
  const showCaptions = photos.length >= 4;
  let tags = [];
  if (Array.isArray(listing.utilities)) tags = listing.utilities;
  else if (listing.utilities && typeof listing.utilities === 'object') {
    tags = Object.keys(listing.utilities).filter((k) => listing.utilities[k] === true);
  }
  const areaName = listing.areas?.name || 'Ikere Ekiti';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <button onClick={() => navigate(-1)} className="text-sm font-semibold text-brand-700 hover:text-brand-600">
        ← Back to rooms
      </button>

      {/* Distance banner */}
      {dist.state !== 'idle' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span className="text-lg">📍</span>
          {dist.state === 'loading' && <span>Checking how far this is from you…</span>}
          {dist.state === 'ok' && (
            <span>
              You are about <strong>{formatDistance(dist.km)}</strong> from {areaName} (around{' '}
              {Math.max(1, Math.round(((dist.km * 1.3) / 5) * 60))} min on foot). Straight-line estimate.
            </span>
          )}
          {dist.state === 'denied' && <span>Allow location in your browser to see how far this room is from you.</span>}
          {dist.state === 'unavailable' && <span>Your browser can’t share location, so distance isn’t available.</span>}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Left: gallery + description */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
            <div
              className="relative aspect-[4/3] bg-gradient-to-br from-brand-100 to-brand-50"
              onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchX.current === null || photos.length < 2) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                if (Math.abs(dx) > 50) {
                  setActive((a) => (dx < 0 ? (a + 1) % photos.length : (a - 1 + photos.length) % photos.length));
                }
                touchX.current = null;
              }}
            >
              {photos.length > 0 ? (
                <img src={photos[active]} alt={listing.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-brand-900/50">No photos yet</div>
              )}

              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActive((active - 1 + photos.length) % photos.length)}
                    aria-label="Previous photo"
                    className="gal-arrow gal-arrow--prev"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 5-7 7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive((active + 1) % photos.length)}
                    aria-label="Next photo"
                    className="gal-arrow gal-arrow--next"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 5 7 7-7 7" />
                    </svg>
                  </button>
                  <span className="gal-chip gal-chip--right">{active + 1} / {photos.length}</span>
                </>
              )}

              {showCaptions && CAPTIONS[active] && (
                <span className="gal-chip gal-chip--left">{CAPTIONS[active]}</span>
              )}
            </div>

            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {photos.map((p, i) => (
                  <button
                    key={p + i}
                    onClick={() => setActive(i)}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
                      i === active ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <h2 className="mt-8 text-xl font-bold">About this room</h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-brand-900/80">
            {listing.description || 'The owner has not added a description yet.'}
          </p>
        </div>

        {/* Right: summary + contact */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium text-brand-900/60">
              {listing.accommodation_type} • {listing.rooms || 1} room
            </p>
            <h1 className="mt-1 text-2xl font-extrabold capitalize leading-snug">{listing.title}</h1>
            <p className="mt-1 text-sm text-brand-900/70">📍 {areaName}</p>

            <p className="mt-4 text-3xl font-extrabold text-brand-700">
              ₦{Number(listing.rent_amount || 0).toLocaleString()}
              <span className="text-sm font-medium text-brand-900/60"> / {periodLabel[listing.rent_period] || 'year'}</span>
            </p>

            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    ✓ {formatTag(t)}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={handleContact}
              disabled={contacting}
              className="mt-6 w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {contacting ? 'Opening WhatsApp…' : user ? 'Chat with owner on WhatsApp' : 'Log in to chat with owner'}
            </button>
            {contactError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{contactError}</p>}

            <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900/75">
              <strong>Stay safe:</strong> see the room in person before you pay anything, and never send money to
              someone you haven't met.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}