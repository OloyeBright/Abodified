import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { compressImage } from '../utils/helpers';

const TYPE_LABEL = { STUDENT: 'Student', AGENT: 'Agent', LANDLORD: 'Landlord' };
const inputClass = 'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

function avatarUrl(path) {
  return path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
}
function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'A';
}
function stars(n) {
  const k = Math.round(Number(n) || 0);
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

// /settings = your own profile. /u/:id = someone else's profile.
export default function Profile() {
  const { id } = useParams();
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState({ display_name: '', account_type: '', bio: '' });
  const [file, setFile] = useState(null);
  const [agree, setAgree] = useState(false);
  const [contacted, setContacted] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const own = !id || (me && id === me.id);
  const targetId = id || me?.id;
  const locked = !!profile?.locked;
  const signupType = ['STUDENT', 'LANDLORD'].includes(me?.user_metadata?.account_type)
    ? me.user_metadata.account_type
    : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMe(session?.user || null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (checking || !targetId) return;
    load();
  }, [checking, targetId]);

  async function load() {
    const [p, r] = await Promise.all([
      supabase.rpc('get_public_profile', { p_user: targetId }),
      supabase.rpc('get_profile_reviews', { p_user: targetId }),
    ]);
    const row = Array.isArray(p.data) ? p.data[0] : p.data;
    setProfile(row || null);
    setReviews(r.data || []);

    if (me && !id) {
      // Pre-fill the form with what they typed at sign-up, if anything
      setForm({
        display_name: row?.display_name && row.display_name !== 'Member' ? row.display_name : me.user_metadata?.full_name || '',
        account_type: row?.account_type || me.user_metadata?.account_type || '',
        bio: row?.bio || '',
      });
    }
    if (me && id && id !== me.id) {
      const { data } = await supabase.rpc('has_contacted_poster', { p_poster: id });
      setContacted(!!data);
    }
  }

  // Saves everything once and locks it
  async function saveProfile(e) {
    e.preventDefault();
    if (!agree) return setNotice('Please tick the box to confirm you understand it cannot be changed after saving.');
    if (form.display_name.trim().length < 2) return setNotice('Please enter your full name.');
    if (!(signupType || form.account_type)) return setNotice('Choose Student or Landlord.');
    if (!file && !profile?.avatar_path) return setNotice('Please choose a profile picture.');

    setBusy(true);
    let path = profile?.avatar_path || null;
    if (file) {
      const small = await compressImage(file, 800, 0.9);
      const ext = small.name.split('.').pop();
      const newPath = `${me.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(newPath, small, { contentType: small.type });
      if (upErr) {
        setBusy(false);
        return setNotice('Picture upload failed: ' + upErr.message);
      }
      path = newPath;
    }

    const { error } = await supabase.rpc('save_my_profile', {
      p_display_name: form.display_name,
      p_account_type: signupType || form.account_type,
      p_bio: form.bio,
      p_avatar_path: path,
    });
    setBusy(false);
    if (error) return setNotice(error.message);

    setFile(null);
    setAgree(false);
    setNotice('Your profile is saved and locked.');
    load();
  }

  async function submitReview(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('reviews').insert({
      poster_id: id,
      reviewer_id: me.id,
      rating: Number(rating),
      comment: reviewText.trim() || null,
    });
    setBusy(false);
    if (error) {
      if (error.code === '23505') return setNotice('You have already reviewed this poster.');
      if (error.code === '42501') return setNotice('You can review this poster after a viewing they confirmed has taken place.');
      return setNotice(error.message);
    }
    setReviewText('');
    setNotice('Thank you. Your review is posted.');
    load();
  }

  if (checking) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!targetId) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Log in to see your profile</h1>
        <Link to="/login" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Log in</Link>
      </div>
    );
  }

  const url = avatarUrl(profile?.avatar_path);
  const lockedName = profile?.display_name && profile.display_name !== 'Member' ? profile.display_name : null;
  const name = own && !locked
    ? form.display_name.trim() || me?.user_metadata?.full_name || 'Member'
    : lockedName || 'Member';
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      {/* ---------- Profile card ---------- */}
      <section className="rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          {url ? (
            <img src={url} alt={name} className="h-24 w-24 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-extrabold text-brand-700">
              {initials(name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="break-words text-2xl font-extrabold">{name}</h1>
              {profile?.account_type && (
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">{TYPE_LABEL[profile.account_type]}</span>
              )}
              {locked && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Verified profile</span>}
            </div>
            {profile?.bio && <p className="mt-2 text-base text-brand-900/80">{profile.bio}</p>}
            {profile?.account_type === 'LANDLORD' && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xl font-extrabold">{profile?.live_rooms ?? 0}</p>
                <p className="text-xs text-brand-900/70">Live rooms</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xl font-extrabold">{profile?.rating_avg ?? '—'}</p>
                <p className="text-xs text-brand-900/70">Average rating</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xl font-extrabold">{profile?.review_count ?? 0}</p>
                <p className="text-xs text-brand-900/70">Reviews</p>
              </div>
            </div>
            )}
            {own && locked && profile?.account_type === 'LANDLORD' && (
              <Link to="/my-listings" className="mt-4 inline-block text-sm font-semibold text-brand-700 underline">View my rooms</Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Set up (own, not saved yet) ---------- */}
      {own && me && !locked && (
        <section className="mt-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Set up your profile</h2>
          <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Save once.</strong> After you save, your picture, name, account type and bio are locked.
            This protects students from scams. To change anything later, contact an admin.
          </div>

          <form onSubmit={saveProfile} className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold">Profile picture <span className="font-normal text-brand-900/50">(required)</span></p>
              <div className="mt-2 flex items-center gap-4">
                {previewUrl || url ? (
                  <img src={previewUrl || url} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm text-brand-900/50">No photo</span>
                )}
                <label className="cursor-pointer rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
                  {file ? 'Choose a different picture' : 'Choose a picture'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
                </label>
              </div>
            </div>

            <label className="block text-sm font-semibold">Full name
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                     placeholder="e.g. Adebayo Tunde" className={inputClass} />
            </label>

            <div>
              {signupType ? (
                <>
                  <p className="text-sm font-semibold">Account type</p>
                  <p className="mt-2 rounded-2xl border-2 border-brand-600 bg-brand-50 p-3 font-bold">
                    {TYPE_LABEL[signupType]}{' '}
                    <span className="font-normal text-brand-900/60">(chosen when you signed up, cannot be changed)</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Which one describes you? <span className="font-normal text-brand-900/60">(you can only choose once)</span></p>
                  <div className="mt-2 grid gap-2">
                    {[
                      { v: 'STUDENT', t: 'I am a student' },
                      { v: 'LANDLORD', t: 'I am a landlord' },
                    ].map((o) => (
                      <button key={o.v} type="button" onClick={() => setForm({ ...form, account_type: o.v })}
                              className={`rounded-2xl border-2 p-3 text-left font-semibold ${
                                form.account_type === o.v ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:border-brand-600'
                              }`}>
                        {form.account_type === o.v ? '✓ ' : ''}{o.t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <label className="block text-sm font-semibold">About you <span className="font-normal text-brand-900/50">(optional, 300 characters)</span>
              <textarea rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                        placeholder="e.g. Final year student, I rent near the main gate." className={inputClass} />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white p-3 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>I understand these details cannot be changed after I save them.</span>
            </label>

            <button type="submit" disabled={busy}
                    className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {busy ? 'Saving…' : 'Save and lock my profile'}
            </button>
          </form>
        </section>
      )}

      {/* ---------- Saved (own, locked) ---------- */}
      {own && me && locked && (
        <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-lg font-bold text-emerald-900">Your profile is saved</h2>
          <p className="mt-1 text-sm text-emerald-900/80">
            Your picture, name, account type and bio are locked to protect students. To change them, contact an admin.
          </p>
        </section>
      )}

      {/* ---------- Review form (students with a confirmed viewing that has passed) ---------- */}
      {!own && me && contacted && (
        <section className="mt-6 space-y-4 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Leave a review</h2>
          <form onSubmit={submitReview} className="space-y-3">
            <label className="block text-sm font-semibold">Rating
              <select value={rating} onChange={(e) => setRating(e.target.value)} className={inputClass}>
                <option value="5">5 — Very good</option>
                <option value="4">4 — Good</option>
                <option value="3">3 — Okay</option>
                <option value="2">2 — Poor</option>
                <option value="1">1 — Very bad</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">What happened? <span className="font-normal text-brand-900/50">(optional, 500 characters)</span>
              <textarea rows={3} maxLength={500} value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Stick to facts: did they reply, was the room as described?" className={inputClass} />
            </label>
            <button type="submit" disabled={busy}
                    className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              Post review
            </button>
          </form>
        </section>
      )}

      {!own && me && !contacted && (
        <p className="mt-6 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900/80">
          You can leave a review after a viewing with this poster has been confirmed and the date has passed.
        </p>
      )}

      {/* ---------- Reviews ---------- */}
      <section className="mt-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Reviews</h2>
        {reviews.length === 0 && <p className="mt-2 text-sm text-brand-900/70">No reviews yet.</p>}
        <div className="mt-3 space-y-3">
          {reviews.map((r, i) => (
            <article key={i} className="rounded-2xl bg-brand-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-amber-500">{stars(r.rating)}</span>
                <span className="text-xs text-brand-900/60">{r.reviewer_name} • {new Date(r.created_at).toLocaleDateString('en-GB')}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm text-brand-900/80">{r.comment}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}