import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { normalizeNgNumber, compressImage, sha256Hex, imageSize } from '../utils/helpers';

const ROOM_TYPES = ['Single Room', 'Self Contain', 'Mini Flat', 'Room & Parlour'];

const UTILITIES = [
  { key: 'water', label: 'Water' },
  { key: 'security', label: 'Security' },
  { key: 'prepaidMeter', label: 'Prepaid meter' },
  { key: 'kitchenAccess', label: 'Kitchen access' },
  { key: 'privateToilet', label: 'Private toilet' },
];

const PHOTO_SLOTS = [
  { key: 'room', label: 'Main room', hint: 'The whole room, from the door' },
  { key: 'bath', label: 'Toilet & bathroom', hint: 'Toilet and shower area' },
  { key: 'kitchen', label: 'Kitchen & water', hint: 'Kitchen, tap or tank' },
  { key: 'outside', label: 'Compound / outside', hint: 'Entrance, gate or street' },
];
const OPTIONAL_SLOTS = [
  { key: 'bedroom2', label: 'Second bedroom', hint: 'For 2-bedroom flats' },
  { key: 'bedroom3', label: 'Third bedroom', hint: 'For bigger flats' },
  { key: 'parlour', label: 'Parlour', hint: 'The sitting room, if there is one' },
];
const MAX_MB = 25;
const MIN_EDGE = 900; // photos smaller than this look blurry on the room page
const MAX_UPLOAD_MB = 5;
const MAX_PROOF_MB = 8;
const MAX_ROOMS = 10;

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

function PhotoSlot({ label, hint, file, onChange }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  if (preview) {
    return (
      <div className="relative h-40 overflow-hidden rounded-2xl border-2 border-brand-600">
        <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1 text-sm font-semibold">{label}</span>
        <div className="absolute right-2 top-2 flex gap-2">
          <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 shadow hover:bg-brand-50">
            Change
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
          </label>
          <button type="button" onClick={() => onChange(null)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-red-700">
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-600 bg-brand-50/50 px-3 text-center hover:bg-brand-50">
      <span className="text-3xl text-brand-600">+</span>
      <span className="mt-1 text-base font-bold">{label}</span>
      <span className="mt-1 text-sm text-brand-900/70">{hint}</span>
      <span className="mt-2 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white">Tap to choose a photo</span>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
    </label>
  );
}

export default function PostListing() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
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
  const [slots, setSlots] = useState({
    room: null, bath: null, kitchen: null, outside: null,
    bedroom2: null, bedroom3: null, parlour: null,
  });
  const [extras, setExtras] = useState([]);
  const [proofFile, setProofFile] = useState(null);

  const [waTested, setWaTested] = useState(false);
  const [waConfirmed, setWaConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  const cleanNumber = normalizeNgNumber(form.contact_number);
  const isVerified = !!profile?.verified_until && new Date(profile.verified_until) > new Date();
  const isSelfContain = form.accommodation_type === 'Self Contain';

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // A self contain is always one room. Choosing it sets the count to 1.
  function chooseRoomType(value) {
    setForm((prev) => ({
      ...prev,
      accommodation_type: value,
      rooms: value === 'Self Contain' ? 1 : prev.rooms,
    }));
  }

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
      const u = session?.user || null;
      setUser(u);

      if (u) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('profile_locked_at, account_type, verified_until')
          .eq('id', u.id)
          .maybeSingle();
        setProfile(prof || null);
      }

      const { data } = await supabase.from('areas').select('id, name').order('name');
      setAreas(data || []);
      setChecking(false);
    }
    init();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    if (!form.title.trim()) return setErrorMsg('Please enter a listing title.');
    if (!form.accommodation_type) return setErrorMsg('Please choose a room type. This is required.');
    if (!form.area_id) return setErrorMsg('Please choose an area.');

    const roomCount = isSelfContain ? 1 : Number(form.rooms);
    if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > MAX_ROOMS) {
      return setErrorMsg(`Enter how many rooms there are, from 1 to ${MAX_ROOMS}.`);
    }

    if (!proofFile) return setErrorMsg('Please upload proof that this house is yours. A rent receipt, a tenancy agreement, or a utility bill in your name.');
    if (proofFile.size > MAX_PROOF_MB * 1024 * 1024) return setErrorMsg(`The proof file must be under ${MAX_PROOF_MB}MB.`);
    if (!form.rent_amount || Number(form.rent_amount) <= 0) return setErrorMsg('Please enter the rent amount.');
    if (!form.exact_address.trim()) return setErrorMsg('Please enter the exact address (only admins see this).');
    if (!cleanNumber) return setErrorMsg('Enter a valid Nigerian WhatsApp number using digits only, e.g. 08012345678.');
    if (!waConfirmed) {
      return setErrorMsg('Please check that this WhatsApp number is verified: tap "Test on WhatsApp" and confirm it opens a real chat.');
    }

    const missing = PHOTO_SLOTS.filter((s) => !slots[s.key]);
    if (missing.length) return setErrorMsg(`Please add all 4 photos. Missing: ${missing.map((m) => m.label).join(', ')}.`);

    const entries = [
      ...PHOTO_SLOTS.map((s) => ({ key: s.key, file: slots[s.key] })),
      ...OPTIONAL_SLOTS.filter((s) => slots[s.key]).map((s) => ({ key: s.key, file: slots[s.key] })),
      ...extras.map((file, i) => ({ key: `extra${i + 1}`, file })),
    ];
    for (const en of entries) {
      if (!en.file.type.startsWith('image/')) return setErrorMsg(`"${en.file.name}" is not an image.`);
      if (en.file.size > MAX_MB * 1024 * 1024) return setErrorMsg(`"${en.file.name}" is bigger than ${MAX_MB}MB.`);
      const dim = await imageSize(en.file);
      if (dim && Math.max(dim.w, dim.h) < MIN_EDGE) {
        return setErrorMsg(`"${en.file.name}" is too small (${dim.w} x ${dim.h}) and will look blurry. Use a photo taken with your phone camera, at least ${MIN_EDGE} pixels wide.`);
      }
    }

    setSubmitting(true);

    const urls = [];
    for (let i = 0; i < entries.length; i++) {
      const file = await compressImage(entries[i].file);
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setSubmitting(false);
        return setErrorMsg(`"${entries[i].file.name}" is still too large. Please pick a smaller photo.`);
      }
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}-${entries[i].key}.${ext}`;
      const { error: upErr } = await supabase.storage.from('listing-photos').upload(path, file);
      if (upErr) {
        setSubmitting(false);
        return setErrorMsg(`Photo ${i + 1} failed to upload: ${upErr.message}`);
      }
      urls.push(supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl);
    }

    const proofHash = await sha256Hex(proofFile);
    const pext = proofFile.name.split('.').pop();
    const proofPath = `${user.id}/${Date.now()}-proof.${pext}`;
    const { error: pErr } = await supabase.storage.from('listing-proof').upload(proofPath, proofFile);
    if (pErr) {
      setSubmitting(false);
      return setErrorMsg('Proof upload failed: ' + pErr.message);
    }

    const { error: insertError } = await supabase.from('listings').insert({
      owner_id: user.id,
      title: form.title.trim(),
      accommodation_type: form.accommodation_type,
      area_id: Number(form.area_id),
      rooms: roomCount,
      rent_amount: Number(form.rent_amount),
      rent_period: form.rent_period,
      utilities,
      exact_address: form.exact_address.trim(),
      contact_number: cleanNumber,
      description: form.description.trim(),
      photo_url: urls[0],
      photos: urls,
      poster_type: 'LANDLORD',
      proof_path: proofPath,
      proof_hash: proofHash,
      status: 'PENDING',
    });

    if (insertError) {
      setSubmitting(false);
      return setErrorMsg('Could not save listing: ' + insertError.message);
    }

    setSubmitting(false);
    setDone(true);
  }

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

  if (!profile?.profile_locked_at) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Set up your profile first</h1>
        <p className="mt-2 text-base text-brand-900/75">Save your picture, name and account type once. Then you can continue.</p>
        <Link to="/settings" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Set up my profile
        </Link>
      </div>
    );
  }

  if (profile.account_type !== 'LANDLORD') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Only landlords can post rooms</h1>
        <p className="mt-2 text-base text-brand-900/75">
          Students can browse rooms, contact owners, ask questions and leave reviews.
        </p>
        <Link to="/browse" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Browse rooms
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
            {isVerified
              ? 'An admin will check your listing and your proof. Once approved it will appear on the homepage for 14 days.'
              : 'Your room is saved. It will be reviewed once your identity check is approved.'}
          </p>
          <Link to="/my-listings" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
            View my rooms
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

      {!isVerified && (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Your identity check is not approved yet.</p>
          <p className="mt-1 text-sm">
            You can fill in and submit this room now. It will be reviewed only after your identity is approved.
          </p>
          <Link to="/verify" className="mt-2 inline-block text-sm font-semibold underline">Check my identity status</Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="rounded-2xl border-2 border-brand-600 bg-brand-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">1</span>
            <p className="text-lg font-bold">Add proof that this house is yours</p>
          </div>
          <p className="mt-2 text-base text-brand-900/80">
            A rent receipt, a tenancy agreement, or an electricity or water bill with your name on it. Photo or PDF, under {MAX_PROOF_MB}MB.
            Only admins see this.
          </p>

          {proofFile ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
              <span className="text-base font-semibold text-brand-700">✓ {proofFile.name}</span>
              <button type="button" onClick={() => setProofFile(null)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                Remove this file
              </button>
            </div>
          ) : (
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl bg-brand-700 px-5 py-4 text-center text-lg font-bold text-white hover:bg-brand-600">
              Tap here to choose the file
              <input type="file" accept="image/*,application/pdf" className="hidden"
                     onChange={(e) => setProofFile(e.target.files[0] || null)} />
            </label>
          )}
        </div>

        <div>
          <label className="text-sm font-semibold">Listing title</label>
          <input value={form.title} onChange={(e) => update('title', e.target.value)}
                 placeholder="e.g. Bright self contain near campus" className={inputClass} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Room type <span className="text-red-600">*</span></label>
            <select required value={form.accommodation_type} onChange={(e) => chooseRoomType(e.target.value)} className={inputClass}>
              <option value="" disabled>Choose a room type…</option>
              {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Area <span className="text-red-600">*</span></label>
            <select required value={form.area_id} onChange={(e) => update('area_id', e.target.value)} className={inputClass}>
              <option value="" disabled>Choose an area…</option>
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
            <input type="number" min="1" max={isSelfContain ? 1 : MAX_ROOMS} required={!isSelfContain} disabled={isSelfContain}
                   value={isSelfContain ? 1 : form.rooms} onChange={(e) => update('rooms', e.target.value)} className={inputClass} />
            {isSelfContain && <p className="mt-1 text-xs text-brand-900/60">A self contain is always 1 room.</p>}
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

        <div>
          <label className="text-sm font-semibold">WhatsApp number</label>
          <div className="mt-1 flex gap-2">
            <input type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
                   value={form.contact_number} onChange={handleNumber} placeholder="e.g. 08012345678"
                   className="w-full flex-1 rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600" />
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

        <div>
          <p className="text-sm font-semibold">Photos <span className="font-normal text-brand-900/50">(first 4 required, big photos are fine, we shrink them for you)</span></p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {PHOTO_SLOTS.map((s) => (
              <PhotoSlot key={s.key} label={s.label} hint={s.hint} file={slots[s.key]}
                         onChange={(f) => setSlots((p) => ({ ...p, [s.key]: f }))} />
            ))}
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold">
              Bigger place? <span className="font-normal text-brand-900/50">(optional)</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {OPTIONAL_SLOTS.map((s) => (
                <div key={s.key}>
                  <PhotoSlot label={s.label} hint={s.hint} file={slots[s.key]}
                             onChange={(f) => setSlots((p) => ({ ...p, [s.key]: f }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-brand-900/70">More photos (optional, up to 4)</label>
            <input key={extras.length === 0 ? 'empty' : 'full'} type="file" accept="image/*" multiple
                   onChange={(e) => setExtras(Array.from(e.target.files).slice(0, 4))}
                   className="mt-1 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700" />
            {extras.length > 0 && (
              <div className="mt-2 flex items-center gap-3">
                <p className="text-base text-brand-900/80">{extras.length} extra photo(s) selected</p>
                <button type="button" onClick={() => setExtras([])}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                  Clear extra photos
                </button>
              </div>
            )}
          </div>
        </div>

        {errorMsg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}

        <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-brand-700 py-3.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {submitting ? 'Uploading and submitting…' : 'Submit for review'}
        </button>
      </form>
    </div>
  );
}