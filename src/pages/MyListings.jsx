import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { normalizeNgNumber } from '../utils/helpers';
import { useConfirm } from '../components/ConfirmDialog';

const ROOM_TYPES = ['Single Room', 'Self Contain', 'Mini Flat', 'Room & Parlour'];
const UTILITIES = [
  { key: 'water', label: 'Water' },
  { key: 'security', label: 'Security' },
  { key: 'prepaidMeter', label: 'Prepaid meter' },
  { key: 'kitchenAccess', label: 'Kitchen access' },
  { key: 'privateToilet', label: 'Private toilet' },
];
const DAY = 86400000;
const COLUMNS =
  'id, title, status, accommodation_type, rooms, rent_amount, rent_period, description, utilities, photo_url, photos, area_id, expires_at, rejection_reason, areas(name)';

const STATUS = {
  PENDING: { label: 'Waiting for review', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800' },
  EXPIRED: { label: 'Expired', cls: 'bg-gray-200 text-gray-700' },
  UNAVAILABLE: { label: 'Marked unavailable', cls: 'bg-gray-200 text-gray-700' },
  REJECTED: { label: 'Not approved', cls: 'bg-red-100 text-red-700' },
};

const inputClass =
  'mt-1 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-600';
const btnPrimary =
  'rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50';
const btnSecondary =
  'rounded-lg border border-brand-100 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50';
const btnWarn =
  'rounded-lg border border-amber-200 px-3.5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50';

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function daysLeft(d) {
  return d ? (new Date(d).getTime() - Date.now()) / DAY : null;
}
function toObj(u) {
  if (Array.isArray(u)) return Object.fromEntries(u.map((k) => [k, true]));
  return u && typeof u === 'object' ? u : {};
}
function friendly(err) {
  if (err?.code === '23505') {
    return 'You already have a live listing for this same room. Mark that one unavailable first.';
  }
  return err?.message || 'Something went wrong. Please try again.';
}

export default function MyListings() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [chats, setChats] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ask, dialog] = useConfirm();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      setChecking(false);
      const { data: areaRows } = await supabase.from('areas').select('id, name').order('name');
      setAreas(areaRows || []);
      if (u) load(u.id);
      else setLoading(false);
    }
    init();
  }, []);

  async function load(uid) {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select(COLUMNS)
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });
    if (error) setNotice('Could not load your rooms: ' + error.message);
    else setItems(data || []);
    const { data: chatRows } = await supabase.rpc('my_conversations');
    setChats((chatRows || []).filter((c) => c.landlord_id === uid));
    setLoading(false);
  }

  function refresh() {
    if (user) load(user.id);
  }

  async function run(item, call, okMsg) {
    setBusy(item.id);
    const { error } = await call();
    setBusy(null);
    if (error) setNotice(friendly(error));
    else {
      setNotice(okMsg);
      refresh();
    }
  }

  const reconfirm = (item) =>
    run(item, () => supabase.rpc('reconfirm_listing', { p_listing_id: item.id }),
      '✅ Reconfirmed. Your room is live for another 14 days.');

  const relist = (item) =>
    run(item, () => supabase.rpc('request_review', { p_listing_id: item.id }),
      'Sent back to the admin for review.');

  async function markUnavailable(item) {
    const ok = await ask({
      title: 'Mark as unavailable?',
      message: `"${item.title}" will be hidden from students until you make it available again.`,
      confirmText: 'Mark unavailable',
      danger: true,
    });
    if (!ok) return;
    run(item, () => supabase.rpc('mark_listing_unavailable', { p_listing_id: item.id }),
      'Marked as unavailable.');
  }

  async function openEdit(item) {
    setNotice('');
    const { data } = await supabase.rpc('get_listing_private', { p_listing_id: item.id });
    const row = Array.isArray(data) ? data[0] : data;
    setForm({
      title: item.title || '',
      accommodation_type: item.accommodation_type || 'Self Contain',
      area_id: String(item.area_id || ''),
      rooms: item.rooms || 1,
      rent_amount: String(item.rent_amount || ''),
      rent_period: item.rent_period || 'yearly',
      description: item.description || '',
      utilities: toObj(item.utilities),
      exact_address: row?.exact_address || '',
      contact_number: row?.contact_number || '',
    });
    setEditing(item);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const phone = normalizeNgNumber(form.contact_number);
    if (!form.title.trim()) return setNotice('Please enter a title.');
    if (!Number(form.rent_amount) || Number(form.rent_amount) <= 0) return setNotice('Please enter the rent amount.');
    if (!form.area_id) return setNotice('Please choose an area.');
    if (!form.exact_address.trim()) return setNotice('Please enter the exact address.');
    if (!phone) return setNotice('Enter a valid Nigerian WhatsApp number, digits only, e.g. 08012345678.');

    setSaving(true);
    const { data, error } = await supabase
      .from('listings')
      .update({
        title: form.title.trim(),
        accommodation_type: form.accommodation_type,
        area_id: Number(form.area_id),
        rooms: form.accommodation_type === 'Self Contain' ? 1 : Number(form.rooms),
        rent_amount: Number(form.rent_amount),
        rent_period: form.rent_period,
        description: form.description.trim(),
        utilities: form.utilities,
        exact_address: form.exact_address.trim(),
        contact_number: phone,
      })
      .eq('id', editing.id)
      .select('id');
    setSaving(false);

    if (error) return setNotice('Could not save: ' + friendly(error));
    if (!data?.length) return setNotice('Nothing was saved. Check that this is your listing.');

    setNotice('Saved.');
    setEditing(null);
    setForm(null);
    refresh();
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function EditForm() {
    return (
      <form onSubmit={saveEdit} className="space-y-4 rounded-3xl border-2 border-brand-600 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit “{editing.title}”</h2>
          <button type="button" onClick={() => { setEditing(null); setForm(null); }}
                  className="text-sm font-semibold text-brand-900/60 hover:text-brand-900">Cancel</button>
        </div>
        <p className="text-xs text-brand-900/60">Photos cannot be changed here yet. To change photos, post the room again.</p>

        <label className="block text-sm font-semibold">Title
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} className={inputClass} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Room type
            <select value={form.accommodation_type}
                    onChange={(e) => setForm((f) => ({ ...f, accommodation_type: e.target.value, rooms: e.target.value === 'Self Contain' ? 1 : f.rooms }))}
                    className={inputClass}>
              {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Area
            <select value={form.area_id} onChange={(e) => setField('area_id', e.target.value)} className={inputClass}>
              <option value="">Choose an area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-semibold">Rent (₦)
            <input type="number" min="0" value={form.rent_amount} onChange={(e) => setField('rent_amount', e.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold">Paid
            <select value={form.rent_period} onChange={(e) => setField('rent_period', e.target.value)} className={inputClass}>
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Rooms
            <input type="number" min="1" max={form.accommodation_type === 'Self Contain' ? 1 : 10}
                   disabled={form.accommodation_type === 'Self Contain'} value={form.accommodation_type === 'Self Contain' ? 1 : form.rooms}
                   onChange={(e) => setField('rooms', e.target.value)} className={inputClass} />
          </label>
        </div>

        <div>
          <p className="text-sm font-semibold">What’s included</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {UTILITIES.map((u) => (
              <label key={u.key}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  form.utilities[u.key] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-brand-900/70'
                }`}>
                <input type="checkbox" className="hidden" checked={!!form.utilities[u.key]}
                       onChange={() => setField('utilities', { ...form.utilities, [u.key]: !form.utilities[u.key] })} />
                {form.utilities[u.key] ? '✓ ' : ''}{u.label}
              </label>
            ))}
          </div>
        </div>

        <label className="block text-sm font-semibold">Exact address <span className="font-normal text-brand-900/50">(admins, and a student only after you confirm their viewing)</span>
          <input value={form.exact_address} onChange={(e) => setField('exact_address', e.target.value)} className={inputClass} />
        </label>

        <label className="block text-sm font-semibold">WhatsApp number
          <input type="tel" inputMode="numeric" value={form.contact_number}
                 onChange={(e) => setField('contact_number', e.target.value.replace(/\D/g, ''))}
                 placeholder="e.g. 08012345678" className={inputClass} />
        </label>

        <label className="block text-sm font-semibold">Description
          <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} className={inputClass} />
        </label>

        <button type="submit" disabled={saving}
                className="w-full rounded-xl bg-brand-700 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    );
  }

  if (checking) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Log in to see your rooms</h1>
        <Link to="/login" state={{ from: { pathname: '/my-listings' } }}
              className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  const expiringSoon = items.filter((i) => i.status === 'ACTIVE' && daysLeft(i.expires_at) <= 2).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {dialog}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-600">My rooms</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Manage your listings</h1>
        </div>
        <Link to="/post-listing" className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
          + Post a new room
        </Link>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      {expiringSoon > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          ⏳ {expiringSoon} of your rooms expire within 2 days. Tap <strong>Reconfirm</strong> on each one that is still available.
        </div>
      )}

      <div className="mt-8 space-y-4">
        {loading && <p className="py-12 text-center text-brand-900/60">Loading your rooms…</p>}

        {!loading && items.length === 0 && (
          <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">
            You have not posted a room yet.
          </p>
        )}

        {items.map((item) => {
          if (editing?.id === item.id && form) return <EditForm key={item.id} />;

          const st = STATUS[item.status] || STATUS.PENDING;
          const cover = item.photos?.[0] || item.photo_url;
          const left = daysLeft(item.expires_at);
          const working = busy === item.id;
          const roomChats = chats.filter((c) => Number(c.listing_id) === Number(item.id));
          const unread = roomChats.reduce((n, c) => n + Number(c.unread || 0), 0);
          const requests = roomChats.filter((c) => c.booking_status === 'PENDING').length;
          const confirmed = roomChats.filter((c) => c.booking_status === 'CONFIRMED').length;
          const chatLink = roomChats.length === 1 ? `/messages/${roomChats[0].id}` : '/messages';

          return (
            <article key={item.id} className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
              <div className="flex gap-4">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                  {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold capitalize">{item.title}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-brand-900/60">
                    {item.areas?.name} • ₦{Number(item.rent_amount).toLocaleString()} / {item.rent_period === 'monthly' ? 'month' : 'year'}
                  </p>
                  {item.status === 'ACTIVE' && (
                    <p className={`mt-1 text-xs font-semibold ${left <= 2 ? 'text-amber-700' : 'text-brand-900/60'}`}>
                      {left <= 2 ? 'Expires soon' : 'Live until'} {fmt(item.expires_at)}
                    </p>
                  )}
                  {item.status === 'EXPIRED' && (
                    <p className="mt-1 text-xs text-brand-900/60">Expired on {fmt(item.expires_at)}. Send it for review to show it again.</p>
                  )}

                  {item.status === 'PENDING' && (
                    <p className="mt-1 text-xs text-brand-900/60">Reviewed once your identity is approved and the proof is checked.</p>
                  )}
                  
                  {roomChats.length > 0 && (
                    <Link to={chatLink} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                      <span>💬 {roomChats.length} chat{roomChats.length === 1 ? '' : 's'}</span>
                      {unread > 0 && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-white">{unread} new</span>}
                      {requests > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{requests} viewing request{requests === 1 ? '' : 's'}</span>}
                      {confirmed > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{confirmed} confirmed</span>}
                    </Link>
                  )}
                  {item.status === 'REJECTED' && item.rejection_reason && (
                    <p className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-700">Reason: {item.rejection_reason}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === 'ACTIVE' && (
                  <button disabled={working} onClick={() => reconfirm(item)} className={btnPrimary}>
                    Reconfirm availability
                  </button>
                )}
                {item.status === 'EXPIRED' && (
                  <button disabled={working} onClick={() => relist(item)} className={btnPrimary}>
                    Send for review to relist
                  </button>
                )}
                {item.status === 'UNAVAILABLE' && (
                  <button disabled={working} onClick={() => relist(item)} className={btnPrimary}>
                    Make available again
                  </button>
                )}
                {item.status === 'REJECTED' && (
                  <button disabled={working} onClick={() => openEdit(item)} className={btnPrimary}>
                    Edit &amp; resubmit
                  </button>
                )}
                {(item.status === 'ACTIVE' || item.status === 'PENDING') && (
                  <button disabled={working} onClick={() => openEdit(item)} className={btnSecondary}>
                    Edit
                  </button>
                )}
                {(item.status === 'ACTIVE' || item.status === 'PENDING') && (
                  <button disabled={working} onClick={() => markUnavailable(item)} className={btnWarn}>
                    Mark unavailable
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}