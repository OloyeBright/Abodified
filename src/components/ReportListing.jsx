import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const REPORT_REASONS = [
  'Room is not available',
  'Photos are not of this room',
  'Price is wrong',
  'Address is fake or wrong',
  'WhatsApp number does not work',
  'Scam or asking for money',
  'Other',
];

export default function ReportListing({ listingId, user }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const messageOk = message.trim().length >= 10;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!reason) return setError('Please choose a reason.');
    if (!messageOk) return setError('Please describe the problem in at least 10 characters.');

    setSending(true);
    const { error: err } = await supabase.from('listing_reports').insert({
      listing_id: listingId,
      reporter_id: user.id,
      reason,
      message: message.trim(),
    });
    setSending(false);

    if (err) {
      if (err.code === '23505') return setError('You have already reported this room. Our team will look at it.');
      return setError('Could not send your report: ' + err.message);
    }
    setDone(true);
  }

  if (!user) {
    return (
      <div className="mt-4 text-center">
        <p className="text-sm text-brand-900/70">Found a problem with this room?</p>
        <Link to="/login" state={{ from: { pathname: location.pathname } }}
              className="text-sm font-semibold text-red-600 hover:text-red-700">
          Log in to report this room
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
        Thank you. Your report has been sent, and our team will check this room.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-4 text-center">
        <button type="button" onClick={() => setOpen(true)}
                className="text-sm font-semibold text-red-600 hover:text-red-700">
          Report this room
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-4">
      <p className="font-bold text-red-700">Report this room</p>

      <label className="mt-3 block text-sm font-semibold">
        Reason <span className="text-red-600">*</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)} required
                className="mt-1 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-600">
          <option value="">Choose a reason…</option>
          {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>

      <label className="mt-3 block text-sm font-semibold">
        What is wrong? <span className="text-red-600">*</span>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required
                  placeholder="Tell us what you found, e.g. the owner asked for money before I saw the room"
                  className="mt-1 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-600" />
      </label>
      <p className="mt-1 text-xs text-brand-900/60">At least 10 characters. Only admins read reports.</p>

      {error && <p className="mt-3 rounded-lg bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={!reason || !messageOk || sending}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
          {sending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(''); }}
                className="px-3 text-sm font-semibold text-brand-900/60 hover:text-brand-900">
          Cancel
        </button>
      </div>
    </form>
  );
}