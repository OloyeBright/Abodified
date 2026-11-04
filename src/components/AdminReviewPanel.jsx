import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { toWhatsApp } from '../utils/helpers';

const CHECKS = [
  { key: 'check_proof', label: 'Proof checked (ownership document or letter of authority, or a video call with the owner)' },
  { key: 'check_photos', label: 'Photos match this room and this area' },
  { key: 'check_address', label: 'Exact address is plausible for the area' },
  { key: 'check_whatsapp', label: 'WhatsApp number answered and confirmed' },
];

const MIN_REASON = 20;

// The admin review panel for each pending listing.
// - Approve: needs every checklist item ticked and proof attached.
// - Attach proof: the admin uploads a document the poster sent on WhatsApp.
// - Approve without proof: an override that needs a written reason, saved with the listing.
export default function AdminReviewPanel({ item, onChanged, onReject, onDelete }) {
  const [poster, setPoster] = useState(null);
  const [proofUrl, setProofUrl] = useState(null);
  const [checks, setChecks] = useState({});
  const [overrideText, setOverrideText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setChecks({
      check_proof: !!item.check_proof,
      check_photos: !!item.check_photos,
      check_address: !!item.check_address,
      check_whatsapp: !!item.check_whatsapp,
    });
    setOverrideText('');
    setMsg('');
    supabase.rpc('admin_poster_info', { p_owner: item.owner_id }).then(({ data }) => {
      setPoster(Array.isArray(data) ? data[0] : data);
    });
    if (item.proof_path) {
      supabase.storage.from('listing-proof').createSignedUrl(item.proof_path, 600).then(({ data }) => {
        setProofUrl(data?.signedUrl || null);
      });
    } else {
      setProofUrl(null);
    }
  }, [item.id]);

  const needsProof = item.poster_type === 'LANDLORD' || item.poster_type === 'AGENT';
  const hasProof = !!item.proof_path;
  const allTicked = CHECKS.every((c) => checks[c.key]);
  const suspended = !!poster?.is_suspended;
  const canApprove = allTicked && (!needsProof || hasProof) && !suspended;
  const reasonOk = overrideText.trim().length >= MIN_REASON;
  const canOverride = needsProof && !hasProof && allTicked && reasonOk && !suspended;

  async function toggle(key) {
    const value = !checks[key];
    const { data, error } = await supabase
      .from('listings')
      .update({ [key]: value })
      .eq('id', item.id)
      .select('id');
    if (error || !data?.length) {
      setMsg('That tick was NOT saved: ' + (error?.message || 'the database blocked it.'));
      return;
    }
    setChecks({ ...checks, [key]: value });
    setMsg('');
  }

    // Reads the checklist from the DATABASE through an admin-only function
  async function missingChecks() {
    const { data, error } = await supabase.rpc('admin_checklist', { p_listing_id: item.id });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      return ['(could not read the checklist: ' + (error?.message || 'no data') + ')'];
    }
    const names = {
      check_proof: 'Proof checked',
      check_photos: 'Photos match',
      check_address: 'Address plausible',
      check_whatsapp: 'WhatsApp confirmed',
    };
    return Object.keys(names).filter((k) => !row[k]).map((k) => names[k]);
  }

  async function attachProof(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setMsg('The file must be under 8MB.');
    setBusy(true);
    const ext = file.name.split('.').pop();
    const path = `${item.owner_id}/${Date.now()}-admin-proof.${ext}`;
    const { error: upErr } = await supabase.storage.from('listing-proof').upload(path, file);
    if (upErr) {
      setBusy(false);
      return setMsg('Upload failed: ' + upErr.message);
    }
    const { data, error } = await supabase.from('listings').update({ proof_path: path }).eq('id', item.id).select('id');
    setBusy(false);
    if (error || !data?.length) return setMsg(error?.message || 'Could not attach the proof.');
    setMsg('Proof attached. You can approve now.');
    onChanged();
  }

  async function approve(extra = {}, confirmText) {
    if (!window.confirm(confirmText)) return;
    const missing = await missingChecks();
    if (missing.length) {
      return setMsg('Still not saved in the database: ' + missing.join(', ') + '. Untick and tick them again.');
    }
    setBusy(true);
    const { data, error } = await supabase
      .from('listings')
      .update({
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        rejection_reason: null,
        ...extra,
      })
      .eq('id', item.id)
      .select('id');
    setBusy(false);
    if (error) return setMsg(error.message);
    if (!data?.length) return setMsg('Nothing changed. The database blocked the approval.');
    onChanged();
  }

  function approveWithProof() {
    if (!canApprove) return setMsg('Complete the checklist and make sure proof is attached first.');
    approve({}, `Approve "${item.title}" and publish it for 14 days?`);
  }

  function approveWithoutProof() {
    if (!canOverride) return setMsg(`Tick every checklist item and write at least ${MIN_REASON} characters of reason.`);
    approve(
      {
        approved_without_proof: true,
        override_reason: overrideText.trim(),
        override_at: new Date().toISOString(),
      },
      `Approve "${item.title}" WITHOUT a document? Your reason will be saved with the listing.`
    );
  }

  async function toggleSuspend() {
    const next = !poster?.is_suspended;
    const text = next
      ? `Suspend ${poster?.poster_email || 'this poster'}? Their pending and live rooms will be rejected, and they cannot post again.`
      : `Lift the suspension for ${poster?.poster_email || 'this poster'}?`;
    if (!window.confirm(text)) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_suspended', { p_user: item.owner_id, p_suspend: next });
    setBusy(false);
    if (error) return setMsg(error.message);
    setPoster({ ...poster, is_suspended: next });
    onChanged();
  }

  return (
    <div className="mt-5 space-y-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
      <p className="text-sm">
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{item.poster_type}</span>{' '}
        Posted by <strong>{poster?.poster_name || 'no name'}</strong> ({poster?.poster_email || 'no email'})
        {suspended && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SUSPENDED</span>}
      </p>

      <div>
        {hasProof && proofUrl && (
          <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 underline">
            Open proof document (link lasts 10 minutes)
          </a>
        )}
        {hasProof && !proofUrl && <p className="text-sm text-brand-900/60">Proof is attached. Loading the link…</p>}
        {!hasProof && (
          <p className={`text-sm font-semibold ${needsProof ? 'text-red-600' : 'text-brand-900/60'}`}>
            {needsProof ? 'No proof attached.' : 'No proof attached (optional for students).'}
          </p>
        )}
      </div>

      {!hasProof && needsProof && (
        <div className="space-y-2 rounded-xl bg-white p-3">
          <p className="text-sm font-bold">Attach proof the poster sent you on WhatsApp</p>
          <input type="file" accept="image/*,application/pdf" disabled={busy}
                 onChange={(e) => attachProof(e.target.files[0] || null)}
                 className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700" />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-bold">Admin checklist</p>
        {CHECKS.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={!!checks[c.key]} onChange={() => toggle(c.key)} className="mt-1" />
            {c.label}
          </label>
        ))}
      </div>

      {item.contact_number && (
        <a href={`https://wa.me/${toWhatsApp(item.contact_number)}`} target="_blank" rel="noreferrer"
           className="text-sm font-semibold text-brand-600 underline">
          Message the poster on WhatsApp
        </a>
      )}

      {needsProof && !hasProof && (
        <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">Approve without a document (use only if you verified the owner yourself)</p>
          <p className="text-xs text-amber-900/80">
            Examples: a video call where the owner showed the house and their name matched. Write how you checked it.
            This reason is saved with the listing and counted in reports.
          </p>
          <textarea rows={3} value={overrideText} onChange={(e) => setOverrideText(e.target.value)}
                    placeholder="e.g. Video call on 4 Nov. Owner showed the house, the gate number matched the photos, and the name on his phone bill matched the call."
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600" />
          <p className={`text-xs ${reasonOk ? 'text-emerald-700' : 'text-amber-900/70'}`}>
            {overrideText.trim().length} / {MIN_REASON} characters minimum
          </p>
          <button disabled={!canOverride || busy} onClick={approveWithoutProof}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">
            Approve without document
          </button>
        </div>
      )}

      {msg && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button disabled={!canApprove || busy} onClick={approveWithProof}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">
          Approve &amp; publish
        </button>
        <button disabled={busy} onClick={onReject}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
          Reject…
        </button>
        <button disabled={busy} onClick={toggleSuspend}
                className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
          {suspended ? 'Lift suspension' : 'Suspend poster'}
        </button>
        <button disabled={busy} onClick={onDelete}
                className="px-3 py-2 text-sm font-semibold text-brand-900/60 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
      </div>
    </div>
  );
}