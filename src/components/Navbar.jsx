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
      else setRole(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Close the mobile menu whenever the page changes
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  async function fetchUserRole(userId) {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (data) setRole(data.role);
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

          {/* Plain button: white with a border; only the hover changes */}
          <Link to="/post-listing" className="btn btn--secondary">
            Post a Room <Icon name="plus" size={18} />
          </Link>

          {user ? (
            <button className="profile-chip" onClick={handleLogout}>
              <span><Icon name="user" size={16} /></span>
              <span>{name}<small>Log out</small></span>
            </button>
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