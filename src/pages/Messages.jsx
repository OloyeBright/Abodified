import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const inputClass =
  'w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-none focus:border-brand-600';

const STATUS_LABEL = {
  PENDING: 'Viewing requested',
  CONFIRMED: 'Viewing confirmed',
  DECLINED: 'Viewing declined',
  CANCELLED: 'Viewing cancelled',
};
const STATUS_CLS = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

function pad(n) {
  return String(n).padStart(2, '0');
}
// Value for <input type="datetime-local"> in the visitor's own time
function localInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function whenLong(d) {
  return new Date(d).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
function whenShort(d) {
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function refreshBell() {
  window.dispatchEvent(new Event('abodified:refresh-bell'));
}

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [convos, setConvos] = useState([]);
  const [messages, setMessages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');

  const active = convos.find((c) => String(c.id) === String(id)) || null;
  const isStudent = !!user && !!active && active.student_id === user.id;
  const isLandlord = !!user && !!active && active.landlord_id === user.id;
  const isMember = isStudent || isLandlord;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setChecking(false);
    });
  }, []);

  async function loadList() {
    const { data } = await supabase.rpc('my_conversations');
    setConvos(data || []);
  }

  async function loadThread() {
    if (!id) return;
    const [m, b] = await Promise.all([
      supabase.from('messages')
        .select('id, sender_id, kind, body, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('bookings')
        .select('id, status, appointment_at, note, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    setMessages(m.data || []);
    setBookings(b.data || []);
    await supabase.rpc('mark_chat_read', { p_conversation_id: Number(id) });
    refreshBell();
    loadList();
  }

  // Load the inbox, and refresh it every 20 seconds as a safety net
  useEffect(() => {
    if (!user) return;
    loadList();
    const t = setInterval(() => { loadList(); if (id) loadThread(); }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  // Load the open chat and listen for new messages and bookings live
  useEffect(() => {
    if (!user || !id) return;
    setNotice('');
    setMessages([]);
    setBookings([]);
    loadThread();
    const ch = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, () => loadThread())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `conversation_id=eq.${id}` }, () => loadThread())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, id]);

  // The exact address is shown to the student only after the landlord confirms a viewing
  const confirmedId = isStudent ? (bookings.find((b) => b.status === 'CONFIRMED')?.id || null) : null;
  useEffect(() => {
    if (!confirmedId) { setAddress(''); return; }
    supabase.rpc('get_booking_address', { p_booking_id: confirmedId }).then(({ data }) => setAddress(data || ''));
  }, [confirmedId]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setNotice('');
    const { error } = await supabase.rpc('send_message', { p_conversation_id: Number(id), p_body: body });
    setBusy(false);
    if (error) return setNotice(error.message);
    setText('');
    loadThread();
  }

  async function book(e) {
    e.preventDefault();
    if (!when) return setNotice('Pick the date and time you want to see the room.');
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return setNotice('That date is not valid.');
    setBusy(true);
    setNotice('');
    const { error } = await supabase.rpc('create_booking', {
      p_conversation_id: Number(id),
      p_when: date.toISOString(),
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setWhen('');
    setNote('');
    loadThread();
  }

  async function answer(bookingId, accept) {
    setBusy(true);
    setNotice('');
    const { error } = await supabase.rpc('respond_booking', { p_booking_id: bookingId, p_accept: accept });
    setBusy(false);
    if (error) return setNotice(error.message);
    loadThread();
  }

  async function cancel(bookingId) {
    if (!window.confirm('Cancel this viewing? The other person will be told.')) return;
    setBusy(true);
    setNotice('');
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
    setBusy(false);
    if (error) return setNotice(error.message);
    loadThread();
  }

  if (checking) return <p className="py-24 text-center text-brand-900/60">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Log in to see your messages</h1>
        <Link to="/login" state={{ from: { pathname: '/messages' } }}
              className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  const openBooking = bookings.find((b) => b.status === 'PENDING' || b.status === 'CONFIRMED') || null;
  const lastClosed = !openBooking ? bookings[0] : null;
  const minWhen = localInput(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const maxWhen = localInput(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

  function senderLabel(m) {
    if (!active) return '';
    if (m.sender_id === active.student_id) return active.student_name;
    if (m.sender_id === active.landlord_id) return active.landlord_name;
    return 'Abodified team';
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Messages</h1>
      <p className="mt-1 text-sm text-brand-900/70">
        Talk to the owner here and book a time to see the room. Phone numbers are never shown.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {/* Chat list */}
        <aside className={`${id ? 'hidden md:block' : ''} md:col-span-1`}>
          <div className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
            {convos.length === 0 && (
              <p className="p-6 text-sm text-brand-900/60">
                No chats yet. Open a room and tap “Message owner” to start one.
              </p>
            )}
            {convos.map((c) => {
              const mine = c.student_id === user.id || c.landlord_id === user.id;
              const other = c.student_id === user.id ? c.landlord_name
                : c.landlord_id === user.id ? c.student_name
                : `${c.student_name} & ${c.landlord_name}`;
              return (
                <button key={c.id} type="button" onClick={() => navigate(`/messages/${c.id}`)}
                        className={`block w-full border-b border-brand-100 px-4 py-3 text-left last:border-b-0 hover:bg-brand-50 ${
                          String(c.id) === String(id) ? 'bg-brand-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{other}</span>
                    {mine && c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                  <p className="truncate text-xs font-semibold capitalize text-brand-700">{c.kind === 'support' ? 'Abodified support' : c.listing_title}</p>
                  <p className="truncate text-sm text-brand-900/70">{c.last_message || 'No messages yet'}</p>
                  {c.booking_status && (c.booking_status === 'PENDING' || c.booking_status === 'CONFIRMED') && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLS[c.booking_status]}`}>
                      {STATUS_LABEL[c.booking_status]} · {whenShort(c.appointment_at)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Open chat */}
        <section className={`${id ? '' : 'hidden md:block'} md:col-span-2`}>
          {!id && (
            <div className="rounded-3xl border border-brand-100 bg-white p-10 text-center text-brand-900/60 shadow-sm">
              Choose a chat on the left.
            </div>
          )}

          {id && !active && (
            <div className="rounded-3xl border border-brand-100 bg-white p-10 text-center shadow-sm">
              <p className="text-brand-900/70">Loading this chat… If it does not open, it may not belong to you.</p>
              <Link to="/messages" className="mt-4 inline-block font-semibold text-brand-700 underline">Back to all chats</Link>
            </div>
          )}

          {id && active && (
            <div className="flex flex-col overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-brand-100 px-4 py-3">
                <button type="button" onClick={() => navigate('/messages')}
                        className="text-sm font-semibold text-brand-700 md:hidden">← Back</button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {isStudent ? active.landlord_name : isLandlord ? active.student_name : `${active.student_name} & ${active.landlord_name}`}
                  </p>
                  {active.kind === 'support' ? (
                    <span className="truncate text-xs font-semibold text-brand-700">Abodified support</span>
                  ) : (
                    <Link to={`/listing/${active.listing_id}`} className="truncate text-xs font-semibold capitalize text-brand-700 underline">
                      {active.listing_title}
                    </Link>
                  )}
                </div>
              </div>

              {!isMember && (
                <p className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
                  You are viewing this chat as an admin. Your messages show as “Abodified team”.
                </p>
              )}

              <div className="h-[48vh] space-y-2 overflow-y-auto bg-brand-50/40 px-4 py-4">
                {messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-brand-900/60">
                    {isStudent && active.kind !== 'support' ? 'Say hello and ask if the room is still available.' : 'No messages yet.'}
                  </p>
                )}
                {messages.map((m) => {
                  if (m.kind === 'system') {
                    return (
                      <p key={m.id} className="mx-auto w-fit max-w-full rounded-full bg-white px-3 py-1 text-center text-xs font-semibold text-brand-900/70 shadow-sm">
                        📅 {m.body} · {whenShort(m.created_at)}
                      </p>
                    );
                  }
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${mine ? 'bg-brand-700 text-white' : 'bg-white text-brand-900 shadow-sm'}`}>
                        {!mine && <p className="text-[11px] font-bold opacity-70">{senderLabel(m)}</p>}
                        <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-brand-900/50'}`}>{whenShort(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Viewing booking */}
              {isMember && active.kind !== 'support' && (
                <div className="border-t border-brand-100 bg-white px-4 py-3">
                  {openBooking && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLS[openBooking.status]}`}>
                          {STATUS_LABEL[openBooking.status]}
                        </span>
                        <p className="mt-1 text-sm font-semibold">{whenLong(openBooking.appointment_at)}</p>
                        {openBooking.note && <p className="text-xs text-brand-900/70">Note: {openBooking.note}</p>}
                        {isStudent && openBooking.status === 'CONFIRMED' && address && (
                          <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">
                            📍 Address: {address}
                            <span className="block text-xs font-normal text-emerald-800">Shown only to you and the landlord.</span>
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isLandlord && openBooking.status === 'PENDING' && (
                          <>
                            <button disabled={busy} onClick={() => answer(openBooking.id, true)}
                                    className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                              Confirm
                            </button>
                            <button disabled={busy} onClick={() => answer(openBooking.id, false)}
                                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                              Decline
                            </button>
                          </>
                        )}
                        <button disabled={busy} onClick={() => cancel(openBooking.id)}
                                className="rounded-lg border border-brand-100 px-4 py-2 text-sm font-semibold text-brand-900/70 hover:bg-brand-50 disabled:opacity-50">
                          Cancel viewing
                        </button>
                      </div>
                    </div>
                  )}

                  {!openBooking && isStudent && (
                    <form onSubmit={book} className="space-y-2">
                      <p className="text-sm font-bold">Book a viewing</p>
                      {lastClosed && (
                        <p className="text-xs text-brand-900/60">
                          Last request: {STATUS_LABEL[lastClosed.status].toLowerCase()} for {whenLong(lastClosed.appointment_at)}.
                        </p>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input type="datetime-local" value={when} min={minWhen} max={maxWhen}
                               onChange={(e) => setWhen(e.target.value)} className={inputClass} />
                        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)}
                               placeholder="Note for the owner (optional)" className={inputClass} />
                      </div>
                      <button type="submit" disabled={busy}
                              className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                        Request this time
                      </button>
                    </form>
                  )}

                  {!openBooking && isLandlord && (
                    <p className="text-sm text-brand-900/70">
                      {lastClosed
                        ? `Last request: ${STATUS_LABEL[lastClosed.status].toLowerCase()} for ${whenLong(lastClosed.appointment_at)}.`
                        : 'The student can request a viewing time here. You will confirm or decline it.'}
                    </p>
                  )}
                </div>
              )}

              {notice && <p className="mx-4 mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{notice}</p>}

              <form onSubmit={send} className="flex items-end gap-2 border-t border-brand-100 bg-white px-4 py-3">
                <textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
                          placeholder="Write a message…" className={inputClass} />
                <button type="submit" disabled={busy || !text.trim()}
                        className="shrink-0 rounded-xl bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                  Send
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}