import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function Footer() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link to="/" aria-label="Abodified home"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#ffffff', fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>
            <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="15" fill="#075e54" />
              <g transform="translate(11.4 8.5) scale(0.95)">
                <polyline points="5,46 22,6 39,46" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="17" y="30" width="10" height="16" rx="2" fill="#FFC93C" />
              </g>
            </svg>
            <span>Abodified</span>
          </Link>
          <p>Trusted student accommodation, built for Ikere Ekiti.</p>
        </div>
        <div>
          <strong>Explore</strong>
          <Link to="/browse">Browse listings</Link>
          <Link to="/post-listing">Post a room</Link>
        </div>
        <div>
          <strong>Account</strong>
          {loggedIn ? (
            <>
              <Link to="/settings">My profile</Link>
              <Link to="/my-listings">My rooms</Link>
              <Link to="/notifications">Notifications</Link>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/signup">Sign up</Link>
            </>
          )}
        </div>
        <div>
          <strong>Location</strong>
          <p>Ikere Ekiti, Ekiti State<br />Nigeria</p>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Abodified <span>Made for the BOUESTI community</span></div>
    </footer>
  );
}