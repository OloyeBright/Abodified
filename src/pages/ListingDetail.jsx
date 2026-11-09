import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatTag, periodLabel, distanceKm, formatDistance } from '../utils/helpers';
import Icon from '../components/Icon';
import ReportListing from '../components/ReportListing';
import PosterByline from '../components/PosterByline';

// Captions for photos taken through the Post a Room form (same order as the form)
const CAPTIONS = ['Main room', 'Toilet & bathroom', 'Kitchen & water', 'Compound & outside'];
const CAPTION_BY_KEY = {
  room: 'Main room', bath: 'Toilet & bathroom', kitchen: 'Kitchen & water',
  outside: 'Compound & outside', bedroom2: 'Second bedroom', bedroom3: 'Third bedroom', parlour: 'Parlour',
};

function captionFor(url, index, total) {
  const m = url && url.match(/-(room|bath|kitchen|outside|bedroom2|bedroom3|parlour)\.[a-z0-9]+(\?.*)?$/i);
  if (m) return CAPTION_BY_KEY[m[1].toLowerCase()];
  return total >= 4 ? CAPTIONS[index] || null : null;
}

// contact_number and exact_address are deliberately NOT selected here.
const DETAIL_COLUMNS =
  'id, title, description, accommodation_type, rooms, rent_amount, rent_period, utilities, photo_url, photos, owner_id, poster_type, areas(name, lat, lng)';

const BOOKING_LABEL = {
  PENDING: 'Viewing requested',
  CONFIRMED: 'Viewing confirmed',
  DECLINED: 'Viewing declined',
  CANCELLED: 'Viewing cancelled',
};
const BOOKING_CLS = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

// Shows this person's chats and viewing bookings for this room, right on the post
function ChatPanel({ listingId, user, isOwner }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('my_conversations').then(({ data }) => {
      if (alive) setRows((data || []).filter((r) => Number(r.listing_id) === Number(listingId)));
    });
    return () => { alive = false; };
  }, [listingId, user.id]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
      <p className="text-sm font-bold">{isOwner ? 'Messages about this room' : 'Your chat about this room'}</p>
      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const other = r.student_id === user.id ? r.landlord_name
            : r.landlord_id === user.id ? r.student_name
            : `${r.student_name} & ${r.landlord_name}`;
          const open = r.booking_status === 'PENDING' || r.booking_status === 'CONFIRMED';
          return (
            <Link key={r.id} to={`/messages/${r.id}`}
                  className="block rounded-xl bg-white p-3 text-sm shadow-sm hover:bg-brand-50">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{other}</span>
                {r.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-bold text-white">{r.unread} new</span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-brand-900/70">{r.last_message || 'No messages yet'}</span>
              {open && (
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${BOOKING_CLS[r.booking_status]}`}>
                  {BOOKING_LABEL[r.booking_status]} ·{' '}
                  {new Date(r.appointment_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

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
  const [poster, setPoster] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentMsg, setCommentMsg] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [posting, setPosting] = useState(false);
  const touchX = useRef(null);

  // 1. Load the listing and who is logged in
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
        setIsAdmin(prof?.role === 'admin');
      } else {
        setIsAdmin(false);
      }

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

  // 2. Poster details, comments, and the chats for this room
  useEffect(() => {
    if (!listing) return;
    supabase.rpc('get_public_profile', { p_user: listing.owner_id }).then(({ data }) => {
      setPoster(Array.isArray(data) ? data[0] : data);
    });
    loadComments();
  }, [listing?.id, user?.id]);

  async function loadComments() {
    const { data } = await supabase.rpc('get_listing_comments', { p_listing_id: Number(id) });
    setComments(data || []);
  }

  // 3. Ask the browser for the visitor's location, then measure the distance
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

  // 4. Open an in-app chat with the owner. No phone number is ever sent to the browser.
  async function handleContact() {
    setContactError('');
    if (!user) return navigate('/login', { state: { from: { pathname: `/listing/${id}` } } });
    setContacting(true);
    const { data, error } = await supabase.rpc('start_conversation', { p_listing_id: listing.id });
    setContacting(false);
    if (error || !data) return setContactError(error?.message || 'Could not open the chat. Please try again.');
    navigate(`/messages/${data}`);
  }

  async function removeComment(commentId) {
    if (!window.confirm('Delete this comment for everyone?')) return;
    const { error } = await supabase.from('listing_comments').delete().eq('id', commentId);
    if (error) return setCommentMsg(error.message);
    loadComments();
  }

  async function postComment(e) {
    e.preventDefault();
    setCommentMsg('');
    const body = commentText.trim();
    if (body.length < 2) return setCommentMsg('Please write a question or an answer first.');
    setPosting(true);
    const { error } = await supabase.from('listing_comments').insert({
      listing_id: listing.id,
      author_id: user.id,
      body,
    });
    setPosting(false);
    if (error) {
      if (error.code === '42501') return setCommentMsg('Save your profile first (open My profile). Then you can ask a question here.');
      return setCommentMsg(error.message);
    }
    setCommentText('');
    loadComments();
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
  let tags = [];
  if (Array.isArray(listing.utilities)) tags = listing.utilities;
  else if (listing.utilities && typeof listing.utilities === 'object') {
    tags = Object.keys(listing.utilities).filter((k) => listing.utilities[k] === true);
  }
  const areaName = listing.areas?.name || 'Ikere Ekiti';
  const isOwner = !!user && user.id === listing.owner_id;
  const canComment = !!user;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <button onClick={() => navigate(-1)} className="text-sm font-semibold text-brand-700 hover:text-brand-600">
        ← Back to rooms
      </button>

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
        {/* Left: gallery, description, comments */}
        <div className="min-w-0 lg:col-span-2">
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
                <>
                  <img src={photos[active]} alt="" aria-hidden="true"
                       className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl" />
                  <img src={photos[active]} alt={listing.title} className="relative h-full w-full object-contain" />
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-brand-900/50">No photos yet</div>
              )}

              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => setActive((active - 1 + photos.length) % photos.length)}
                          aria-label="Previous photo" className="gal-arrow gal-arrow--prev">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
                  </button>
                  <button type="button" onClick={() => setActive((active + 1) % photos.length)}
                          aria-label="Next photo" className="gal-arrow gal-arrow--next">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                  </button>
                  <span className="gal-chip gal-chip--right">{active + 1} / {photos.length}</span>
                </>
              )}

              {captionFor(photos[active], active, photos.length) && (
                <span className="gal-chip gal-chip--left">{captionFor(photos[active], active, photos.length)}</span>
              )}
            </div>

            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {photos.map((p, i) => (
                  <button key={p + i} onClick={() => setActive(i)}
                          className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
                            i === active ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-brand-900/70">
            Photos are shown exactly as the owner took them. Check the floors, walls and water in person.
          </p>

          <div className="about-card">
            <h2>About this room</h2>
            <p>{listing.description || 'The owner has not added a description yet.'}</p>
          </div>

          {/* ---------- Comments ---------- */}
          <section className="mt-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Questions and answers</h2>
            <p className="text-sm text-brand-900/70">
              {user
                ? 'Everyone can see these questions and answers. For private matters, use Message owner.'
                : 'Log in to ask a question. The owner can answer.'}
            </p>

            <div className="mt-4 space-y-3">
              {comments.length === 0 && <p className="text-sm text-brand-900/60">No questions yet.</p>}
              {comments.map((c) => (
                <article key={c.id} className={`rounded-2xl p-4 ${c.is_poster ? 'bg-sky-50' : 'bg-brand-50'}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-brand-900">{c.author_name}</span>
                    {c.is_poster && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-800">Owner</span>}
                    <span className="text-brand-900/50">{new Date(c.created_at).toLocaleDateString('en-GB')}</span>
                    {isAdmin && (
                      <button type="button" onClick={() => removeComment(c.id)} className="ml-auto font-semibold text-red-600 hover:text-red-700">
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-2 break-words text-sm text-brand-900/85">{c.body}</p>
                </article>
              ))}
            </div>

            {user && canComment && (
              <form onSubmit={postComment} className="mt-4 space-y-2">
                <textarea rows={2} maxLength={400} value={commentText} onChange={(e) => setCommentText(e.target.value)}
                          placeholder={isOwner ? 'Answer a question…' : 'Ask a question about this room…'}
                          className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600" />
                <p className="text-xs text-brand-900/60">
                  Do not share phone numbers, links or the exact address here. Use Message owner for private details.
                </p>
                <button type="submit" disabled={posting}
                        className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </form>
            )}
            {!user && (
              <p className="mt-4 text-sm text-brand-900/70">
                <Link to="/login" className="font-semibold text-brand-700 underline">Log in</Link> to ask a question.
              </p>
            )}
            {commentMsg && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{commentMsg}</p>}
          </section>
        </div>

        {/* Right: summary + contact */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
            <PosterByline poster={poster} posterType={listing.poster_type} />

            <p className="mt-4 text-xs font-medium text-brand-900/60">
              {listing.accommodation_type} • {listing.rooms || 1} room
            </p>
            <h1 className="mt-1 break-words text-2xl font-extrabold capitalize leading-snug">{listing.title}</h1>
            <p className="mt-1 text-sm text-brand-900/70">📍 {areaName}</p>

            <p className="mt-4 text-3xl font-extrabold text-brand-700">
              ₦{Number(listing.rent_amount || 0).toLocaleString()}
              <span className="text-sm font-medium text-brand-900/60"> / {periodLabel[listing.rent_period] || 'year'}</span>
            </p>

            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">✓ {formatTag(t)}</span>
                ))}
              </div>
            )}

            {!isOwner && (
              <button onClick={handleContact} disabled={contacting}
                      className="mt-6 w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                {contacting ? 'Opening chat…' : user ? 'Message owner' : 'Log in to message owner'}
              </button>
            )}
            {contactError && (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {contactError}
                {/profile/i.test(contactError) && (
                  <> <Link to="/settings" className="font-semibold underline">Set up my profile</Link></>
                )}
              </p>
            )}
            {user && <ChatPanel listingId={listing.id} user={user} isOwner={isOwner} />}
            {poster?.user_id && (
              <Link to={`/u/${poster.user_id}`} className="mt-3 block text-center text-sm font-semibold text-brand-700 underline">
                See the poster’s profile and reviews
              </Link>
            )}

            <div className="safe-card">
              <div className="safe-card__head">
                <span><Icon name="shield" size={20} /></span>
                <strong>Stay safe before you pay</strong>
              </div>
              <ul>
                <li>See the room in person before you pay anything.</li>
                <li>Never send money to someone you haven’t met.</li>
                <li>Ask for a signed receipt with the amount and date.</li>
                <li>Take a friend with you when you go to see it.</li>
              </ul>
            </div>

            <ReportListing listingId={listing.id} user={user} />
          </div>
        </aside>
      </div>
    </div>
  );
}