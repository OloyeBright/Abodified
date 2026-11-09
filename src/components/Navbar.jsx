import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Icon from './Icon';
import './Navbar.css';

const TYPE_LABEL = { LANDLORD: 'Landlord', AGENT: 'Agent', STUDENT: 'Student' };

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'A';
}

function avatarUrl(path) {
  return path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);          // mobile hamburger
  const [menuOpen, setMenuOpen] = useState(false);  // avatar dropdown (desktop)
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarPath, setAvatarPath] = useState(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
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
      else {
        setRole(null); setAccountType(null); setUnread(0);
        setDisplayName(''); setAvatarPath(null); setProfileIncomplete(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
    if (user) {
      countUnread();
      checkProfile();
    }
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

  // Close the dropdown when you click outside it or press Escape
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function fetchUserRole(userId) {
    const { data } = await supabase.from('profiles').select('role, account_type').eq('id', userId).single();
    if (data) { setRole(data.role); setAccountType(data.account_type); }

    // Name and picture are optional extras. If the query fails, the menu falls back to the email name.
    const { data: extra, error } = await supabase
      .from('profiles').select('display_name, avatar_path').eq('id', userId).maybeSingle();
    if (!error && extra) {
      setDisplayName(extra.display_name || '');
      setAvatarPath(extra.avatar_path || null);
    }
  }

  // Replaces the old banner: a small dot on the avatar and one line in the menu
  async function checkProfile() {
    const { data, error } = await supabase.rpc('is_profile_complete');
    setProfileIncomplete(!error && data !== true);
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
    setMenuOpen(false);
    navigate('/');
  }

  const name = displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account';
  const photo = avatarUrl(avatarPath);
  const typeLabel = TYPE_LABEL[accountType] || null;

  const avatar = (
    <span className="user-menu__avatar">
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );

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

              <div className="user-menu" ref={menuRef}>
                <button type="button" className="user-menu__trigger"
                        aria-haspopup="menu" aria-expanded={menuOpen}
                        aria-label={profileIncomplete ? 'Account menu, profile not set up yet' : 'Account menu'}
                        onClick={() => setMenuOpen((v) => !v)}>
                  {avatar}
                  <span className="user-menu__chev"><Icon name="chevron" size={16} /></span>
                  {profileIncomplete && <span className="user-menu__dot" />}
                </button>

                <div className={`user-menu__panel ${menuOpen ? 'user-menu__panel--open' : ''}`} role="menu">
                  <div className="user-menu__head">
                    {avatar}
                    <div className="user-menu__who">
                      <strong>{name}</strong>
                      <small>{user.email}</small>
                      <span className="user-menu__badges">
                        {typeLabel && <span className="user-menu__badge">{typeLabel}</span>}
                        {role === 'admin' && <span className="user-menu__badge user-menu__badge--admin">Admin</span>}
                      </span>
                    </div>
                  </div>

                  {profileIncomplete && (
                    <Link to="/settings" role="menuitem" className="user-menu__item user-menu__item--nudge">
                      <Icon name="alert" size={18} /> Set up your profile
                    </Link>
                  )}

                  <Link to="/settings" role="menuitem" className="user-menu__item">
                    <Icon name="user" size={18} /> My profile
                  </Link>
                  <Link to="/messages" role="menuitem" className="user-menu__item">
                    <Icon name="message" size={18} /> Messages
                  </Link>
                  {accountType === 'LANDLORD' && (
                    <>
                      <Link to="/my-listings" role="menuitem" className="user-menu__item">
                        <Icon name="home" size={18} /> My rooms
                      </Link>
                      <Link to="/verify" role="menuitem" className="user-menu__item">
                        <Icon name="shield" size={18} /> Verify my identity
                      </Link>
                    </>
                  )}

                  {role === 'admin' && (
                    <>
                      <p className="user-menu__section">Admin</p>
                      <Link to="/admin" role="menuitem" className="user-menu__item">
                        <Icon name="dashboard" size={18} /> Admin dashboard
                      </Link>
                      <Link to="/admin/users" role="menuitem" className="user-menu__item">
                        <Icon name="users" size={18} /> Users and checks
                      </Link>
                      <Link to="/admin/reports" role="menuitem" className="user-menu__item">
                        <Icon name="flag" size={18} /> Reports
                      </Link>
                    </>
                  )}

                  <div className="user-menu__sep" />
                  <button type="button" role="menuitem" className="user-menu__item user-menu__item--danger"
                          onClick={handleLogout}>
                    <Icon name="logout" size={18} /> Log out
                  </button>
                </div>
              </div>
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