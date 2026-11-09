import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Icon from './Icon';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) fetchUserRole(u.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) fetchUserRole(u.id);
      else { setRole(null); setAccountType(null); setUnread(0); }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setOpen(false);
    if (user) countUnread();
  }, [location.pathname, user]);

  // Keep the bell fresh: every 30 seconds, and right after a chat is read
  useEffect(() => {
    if (!user) return;
    const t = setInterval(countUnread, 30000);
    window.addEventListener('abodified:refresh-bell', countUnread);
    return () => {
      clearInterval(t);
      window.removeEventListener('abodified:refresh-bell', countUnread);
    };
  }, [user?.id]);

  async function fetchUserRole(userId) {
    const { data } = await supabase.from('profiles').select('role, account_type').eq('id', userId).single();
    if (data) { setRole(data.role); setAccountType(data.account_type); }
  }

  async function countUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);
    setUnread(count || 0);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setOpen(false);
    navigate('/');
  }

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account';

  return (
    <header className="header">
      <div className="nav-wrap">
        <Link to="/" className="logo" aria-label="Abodified home" style={{ gap: 0 }}>
          <svg width="22" height="27" viewBox="0 0 44 50" aria-hidden="true" style={{ flexShrink: 0 }}>
            <polyline points="5,46 22,6 39,46" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="17" y="30" width="10" height="16" rx="2" fill="#FFC93C" />
          </svg>
          <span>bodified</span>
        </Link>

        <nav className={`nav ${open ? 'nav--open' : ''}`} aria-label="Main navigation">
          <Link to="/browse">Browse</Link>
          {role === 'admin' && <Link to="/admin">Admin Dashboard</Link>}
          {user && <Link to="/messages">Messages</Link>}
          {user && accountType === 'LANDLORD' && <Link to="/my-listings">My rooms</Link>}
          {user && <Link to="/settings">My profile</Link>}

          {(!user || accountType === 'LANDLORD') && (
            <Link to="/post-listing" className="btn btn--secondary">
              Post a Room <Icon name="plus" size={18} />
            </Link>
          )}

          {user ? (
            <>
              <Link to="/notifications" className="bell"
                    aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && <span className="bell__dot">{unread > 9 ? '9+' : unread}</span>}
              </Link>
              <button className="profile-chip" onClick={handleLogout}>
                <span><Icon name="user" size={16} /></span>
                <span>{name}<small>Log out</small></span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/signup" className="btn btn--secondary">Sign up</Link>
            </>
          )}
        </nav>

        <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
    </header>
  );
}