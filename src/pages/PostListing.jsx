import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { normalizeNgNumber } from '../utils/helpers';

const ROOM_TYPES = ['Single Room', 'Self Contain', 'Mini Flat', 'Room & Parlour'];

// "key" is what gets saved (ListingCard / ListingDetail read these keys)
const UTILITIES = [
  { key: 'water', label: 'Water' },
  { key: 'security', label: 'Security' },
  { key: 'prepaidMeter', label: 'Prepaid meter' },
  { key: 'kitchenAccess', label: 'Kitchen access' },
  { key: 'privateToilet', label: 'Private toilet' },
];

// 4 required photos, in this order. ListingDetail shows the same captions.
const PHOTO_SLOTS = [
  { key: 'room', label: 'Main room', hint: 'The whole room, from the door' },
  { key: 'bath', label: 'Toilet & bathroom', hint: 'Toilet and shower area' },
  { key: 'kitchen', label: 'Kitchen & water', hint: 'Kitchen, tap or tank' },
  { key: 'outside', label: 'Compound / outside', hint: 'Entrance, gate or street' },
];
const MAX_MB = 5;

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

// One photo box. Shows a preview once a file is chosen.
function PhotoSlot({ label, hint, file, onChange }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  return (
    <label className="relative flex h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-100 bg-brand-50/50 text-center hover:border-brand-600">
      {preview ? (
        <>
          <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold">{label}</span>
        </>
      ) : (
        <>
          <span className="text-2xl text-brand-600">+</span>
          <span className="mt-1 text-sm font-semibold">{label}</span>
          <span className="px-2 text-xs text-brand-900/60">{hint}</span>
        </>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
    </label>
  );
}

export default function PostListing() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [areas, setAreas] = useState([]);

  const [form, setForm] = useState({
    title: '',
    accommodation_type: '',
    area_id: '',
    rooms: 1,
    rent_amount: '',
    rent_period: 'yearly',
    exact_address: '',
    contact_number: '',
    description: '',
  });
  const [utilities, setUtilities] = useState({});
  const [slots, setSlots] = useState({ room: null, bath: null, kitchen: null, outside: null });
  const [extras, setExtras] = useState([]);

  // WhatsApp self-check
  const [waTested, setWaTested] = useState(false);
  const [waConfirmed, setWaConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const cleanNumber = normalizeNgNumber(form.contact_number); // null if invalid

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Digits only. Changing the number cancels any earlier confirmation.
  function handleNumber(e) {
    update('contact_number', e.target.value.replace(/\D/g, ''));
    setWaTested(false);
    setWaConfirmed(false);
  }

  function testWhatsApp() {
    window.open(`https://wa.me/${cleanNumber}`, '_blank', 'noopener');
    setWaTested(true);
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      const { data } = await supabase.from('areas').select('id, name').order('name');
      setAreas(data || []);
      setChecking(false);
    }
    init();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    // ---- 1. Validate everything before sending anything ----
    if (!form.title.trim()) return setErrorMsg('Please enter a listing title.');
    if (!form.accommodation_type) return setErrorMsg('Please choose a room type.');
    if (!form.area_id) return setErrorMsg('Please choose an area.');
    if (!form.rent_amount || Number(form.rent_amount) <= 0) return setErrorMsg('Please enter the rent amount.');
    if (!form.exact_address.trim()) return setErrorMsg('Please enter the exact address (only admins see this).');
    if (!cleanNumber) return setErrorMsg('Enter a valid Nigerian WhatsApp number using digits only, e.g. 08012345678.');
    if (!waConfirmed) {
      return setErrorMsg('Please check that this WhatsApp number is verified: tap "Test on WhatsApp" and confirm it opens a real chat.');
    }

    const missing = PHOTO_SLOTS.filter((s) => !slots[s.key]);
    if (missing.length) return setErrorMsg(`Please add all 4 photos. Missing: ${missing.map((m) => m.label).join(', ')}.`);

    const allFiles = [...PHOTO_SLOTS.map((s) => slots[s.key]), ...extras];
    for (const f of allFiles) {
      if (!f.type.startsWith('image/')) return setErrorMsg(`"${f.name}" is not an image.`);
      if (f.size > MAX_MB * 1024 * 1024) return setErrorMsg(`"${f.name}" is bigger than ${MAX_MB}MB.`);
    }

    setSubmitting(true);

    // ---- 2. Upload every photo, collect the public links ----
    const urls = [];
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from('listing-photos').upload(path, file);
      if (upErr) {
        setSubmitting(false);
        return setErrorMsg(`Photo ${i + 1} failed to upload: ${upErr.message}`);
      }
      urls.push(supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl);
    }

    // ---- 3. Save the listing as PENDING ----
    const { error: insertError } = await supabase.from('listings').insert({
      owner_id: user.id,
      title: form.title.trim(),
      accommodation_type: form.accommodation_type,
      area_id: Number(form.area_id),
      rooms: Number(form.rooms),
      rent_amount: Number(form.rent_amount),
      rent_period: form.rent_period,
      utilities,
      exact_address: form.exact_address.trim(),
      contact_number: cleanNumber,          // saved as 234XXXXXXXXXX
      description: form.description.trim(),
      photo_url: urls[0],                   // cover photo (column already exists)
      photos: urls,                         // all photos (new column)
      status: 'PENDING',
    });

    if (insertError) {
      setSubmitting(false);
      return setErrorMsg('Could not save listing: ' + insertError.message);
    }

    // First-time posters become "poster"
    await supabase.from('profiles').update({ role: 'poster' }).eq('id', user.id).eq('role', 'seeker');

    setSubmitting(false);
    setDone(true);
  }

  // ---------- What the page shows ----------
  if (checking) return <p className="py-20 text-center text-brand-900/60">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-3xl font-extrabold">Log in to post a room</h1>
        <p className="mt-2 text-brand-900/70">You need an account so you can manage your listings.</p>
        <Link to="/login" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-3xl border border-brand-100 bg-white p-8">
          <p className="text-4xl">✅</p>
          <h1 className="mt-3 text-2xl font-extrabold">Submitted for review</h1>
          <p className="mt-2 text-sm text-brand-900/70">
            An admin will check your listing. Once approved it will appear on the homepage for 14 days.
          </p>
          <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-sm font-semibold text-brand-600">Post a room</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Tell students about your room.</h1>
      <p className="mt-2 text-brand-900/70">Every listing is reviewed before it goes live.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <label className="text-sm font-semibold">Listing title</label>
          <input value={form.title} onChange={(e) => update('title', e.target.value)}
                 placeholder="e.g. Bright self contain near campus" className={inputClass} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Room type</label>
            <select value={form.accommodation_type} onChange={(e) => update('accommodation_type', e.target.value)} className={inputClass}>
              <option value="">Choose a room type…</option>
              {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Area</label>
            <select value={form.area_id} onChange={(e) => update('area_id', e.target.value)} className={inputClass}>
              <option value="">Choose an area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="text-sm font-semibold">Rent (₦)</label>
            <input type="number" min="0" value={form.rent_amount} onChange={(e) => update('rent_amount', e.target.value)}
                   placeholder="e.g. 180000" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-semibold">Paid</label>
            <select value={form.rent_period} onChange={(e) => update('rent_period', e.target.value)} className={inputClass}>
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Rooms</label>
            <input type="number" min="1" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">What’s included</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {UTILITIES.map((u) => (
              <label key={u.key}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  utilities[u.key] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-brand-900/70'
                }`}>
                <input type="checkbox" className="hidden" checked={!!utilities[u.key]}
                       onChange={() => setUtilities((p) => ({ ...p, [u.key]: !p[u.key] }))} />
                {utilities[u.key] ? '✓ ' : ''}{u.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">
            Exact address <span className="font-normal text-brand-900/50">(only admins see this)</span>
          </label>
          <input value={form.exact_address} onChange={(e) => update('exact_address', e.target.value)}
                 placeholder="House number, street, landmark" className={inputClass} />
        </div>

        {/* WhatsApp number + self-check */}
        <div>
          <label className="text-sm font-semibold">WhatsApp number</label>
          <div className="mt-1 flex gap-2">
            <input
              type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
              value={form.contact_number} onChange={handleNumber}
              placeholder="e.g. 08012345678"
              className="w-full flex-1 rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600"
            />
            <button type="button" onClick={testWhatsApp} disabled={!cleanNumber}
                    className="shrink-0 rounded-xl border border-brand-600 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40">
              Test on WhatsApp
            </button>
          </div>
          <p className="mt-1.5 text-xs text-brand-900/60">
            Numbers only. Tap “Test on WhatsApp”: it should open a real chat. Students will reach you through this number
            but will never see it.
          </p>
          {waTested && (
            <label className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm">
              <input type="checkbox" checked={waConfirmed} onChange={(e) => setWaConfirmed(e.target.checked)} className="mt-1" />
              <span>I tested it, and it opened a real WhatsApp chat.</span>
            </label>
          )}
        </div>

        <div>
          <label className="text-sm font-semibold">Description</label>
          <textarea rows="4" value={form.description} onChange={(e) => update('description', e.target.value)}
                    placeholder="Tell students what makes this room good: lighting, water, neighbours, distance to campus…"
                    className={inputClass} />
        </div>

        {/* Photos */}
        <div>
          <p className="text-sm font-semibold">Photos <span className="font-normal text-brand-900/50">(all 4 required, max 5MB each)</span></p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {PHOTO_SLOTS.map((s) => (
              <PhotoSlot key={s.key} label={s.label} hint={s.hint} file={slots[s.key]}
                         onChange={(f) => setSlots((p) => ({ ...p, [s.key]: f }))} />
            ))}
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium text-brand-900/70">More photos (optional, up to 4)</label>
            <input type="file" accept="image/*" multiple
                   onChange={(e) => setExtras(Array.from(e.target.files).slice(0, 4))}
                   className="mt-1 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
            {extras.length > 0 && <p className="mt-1 text-xs text-brand-900/60">{extras.length} extra photo(s) selected</p>}
          </div>
        </div>

        {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}

        <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {submitting ? 'Uploading photos & submitting…' : 'Submit for review'}
        </button>
      </form>
    </div>
  );
}