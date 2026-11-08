import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useConfirm } from '../components/ConfirmDialog';

const TYPE_LABEL = { STUDENT: 'Student', LANDLORD: 'Landlord' };

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export default function AdminUsers() {
  const [access, setAccess] = useState('checking');
  const [tab, setTab] = useState('identity');
  const [users, setUsers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [dups, setDups] = useState([]);
  const [links, setLinks] = useState({});
  const [notes, setNotes] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);
  const [ask, dialog] = useConfirm();
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setAccess('denied');
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (data?.role !== 'admin') return setAccess('denied');
      setAccess('admin');
      loadAll();
    }
    init();
  }, []);

  async function loadAll() {
    const [u, q, d] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.rpc('admin_identity_queue'),
      supabase.rpc('admin_duplicate_checks'),
    ]);
    if (u.error) setNotice('Could not load users: ' + u.error.message);
    setUsers(u.data || []);
    setQueue(q.data || []);
    setDups(d.data || []);

    const map = {};
    for (const row of q.data || []) {
      const { data } = await supabase.storage.from('identity-docs').createSignedUrl(row.document_path, 600);
      if (data) map[row.id] = data.signedUrl;
    }
    setLinks(map);
  }

  async function decide(row, approve) {
    const note = (notes[row.id] || '').trim();
    if (note.length < 5) return setNotice('Write a short note on what you checked before deciding.');

    const ok = await ask({
      title: approve ? 'Approve this identity?' : 'Reject this identity?',
      message: approve
        ? 'This landlord can post rooms for 12 months.'
        : 'This landlord cannot post until they submit a new check.',
      confirmText: approve ? 'Approve' : 'Reject',
      danger: !approve,
    });
    if (!ok) return;

    setBusy(row.id);
    const { error } = await supabase.rpc('admin_decide_identity', { p_id: row.id, p_approve: approve, p_note: note });
    setBusy(null);
    if (error) return setNotice(error.message);
    setNotice(approve ? 'Identity approved for 12 months.' : 'Identity rejected.');
    loadAll();
  }

  async function toggleSuspend(u) {
    const next = !u.suspended;
    const ok = await ask(next
      ? { title: 'Suspend this account?', message: `${u.email} cannot post, and their pending and live rooms will be rejected.`, confirmText: 'Suspend', danger: true }
      : { title: 'Lift the suspension?', message: `${u.email} will be able to use the site again.`, confirmText: 'Lift suspension' });
    if (!ok) return;

    setBusy(u.user_id);
    const { error } = await supabase.rpc('admin_set_suspended', { p_user: u.user_id, p_suspend: next });
    setBusy(null);
    if (error) return setNotice(error.message);
    setNotice(next ? 'Account suspended.' : 'Suspension lifted.');
    loadAll();
  }

  async function messageUser(u) {
    setBusy(u.user_id);
    const { data, error } = await supabase.rpc('admin_start_chat', { p_user: u.user_id });
    setBusy(null);
    if (error || !data) return setNotice(error?.message || 'Could not open the chat.');
    navigate(`/messages/${data}`);
  }

  function emailOf(id) {
    return users.find((x) => x.user_id === id)?.email || id;
  }

  if (access === 'checking') return <p className="py-24 text-center text-brand-900/60">Checking access…</p>;

  if (access === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600">Go home</Link>
      </div>
    );
  }

  const tabs = [
    ['identity', `Identity checks (${queue.length})`],
    ['users', `All accounts (${users.length})`],
    ['duplicates', `Possible reuse (${dups.length})`],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {dialog}
      <Link to="/admin" className="text-sm font-semibold text-brand-700">← Back to listings</Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Users and checks</h1>
      <p className="mt-1 text-brand-900/70">Review landlord identity, see every account, and spot reused documents.</p>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="shrink-0 font-semibold text-brand-700">Dismiss</button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2 border-b border-brand-100">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${
                    tab === key ? 'border-brand-700 text-brand-700' : 'border-transparent text-brand-900/60 hover:text-brand-900'
                  }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'identity' && (
        <div className="mt-6 space-y-5">
          {queue.length === 0 && <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">No identity checks waiting.</p>}
          {queue.map((row) => (
            <article key={row.id} className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
              <p className="font-bold">{row.poster_name || 'No name'}</p>
              <p className="text-sm text-brand-900/70">{row.poster_email} • sent {fmt(row.created_at)}</p>

              {links[row.id] ? (
                <a href={links[row.id]} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">
                  Open the ID document (link lasts 10 minutes)
                </a>
              ) : (
                <p className="mt-3 text-sm text-red-600">The document could not be opened.</p>
              )}

              <textarea rows={2} value={notes[row.id] || ''} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
                        placeholder="What did you check? e.g. Name matches the phone, photo matches the ID, number is valid."
                        className="mt-3 w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600" />

              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busy === row.id} onClick={() => decide(row, true)}
                        className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
                  Approve for 12 months
                </button>
                <button disabled={busy === row.id} onClick={() => decide(row, false)}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-brand-100 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-brand-900/70">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Identity</th>
                <th className="p-3">Rooms</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-t border-brand-100">
                  <td className="p-3 font-semibold">{u.full_name || '—'}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.is_admin ? 'Admin' : TYPE_LABEL[u.account_type] || 'Not set'}</td>
                  <td className="p-3">
                    {u.account_type === 'LANDLORD'
                      ? (u.verified_until && new Date(u.verified_until) > new Date() ? `Verified to ${fmt(u.verified_until)}` : 'Not verified')
                      : '—'}
                  </td>
                  <td className="p-3">{u.listing_count}</td>
                  <td className="p-3">
                    {u.suspended ? <span className="font-semibold text-red-600">Suspended</span> : 'Active'}
                  </td>
                  <td className="space-x-2 whitespace-nowrap p-3">
                    {!u.is_admin && (
                      <button disabled={busy === u.user_id} onClick={() => messageUser(u)}
                              className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                        Message
                      </button>
                    )}
                    {!u.is_admin && (
                      <button disabled={busy === u.user_id} onClick={() => toggleSuspend(u)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                u.suspended ? 'border border-brand-600 text-brand-700' : 'border border-red-200 text-red-600'
                              } disabled:opacity-50`}>
                        {u.suspended ? 'Lift suspension' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'duplicates' && (
        <div className="mt-6 space-y-4">
          {dups.length === 0 && <p className="rounded-3xl border border-brand-100 bg-white p-12 text-center text-brand-900/60">No reused documents or ID numbers found.</p>}
          {dups.map((d, i) => (
            <article key={i} className="rounded-2xl border border-red-200 bg-white p-5">
              <p className="font-bold text-red-700">{d.kind} used on {d.times} accounts</p>
              <p className="mt-2 text-sm text-brand-900/80">
                {d.owners.split(', ').map((id) => emailOf(id)).join(' • ')}
              </p>
              <p className="mt-2 text-xs text-brand-900/60">
                Check each account before deciding. The same document can be legitimate, for example a landlord with two properties.
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}