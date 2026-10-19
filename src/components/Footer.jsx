import { Link } from 'react-router-dom';


export default function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link to="/" className="logo" aria-label="Abodified home" style={{ gap: 0 }}>
            <svg width="22" height="27" viewBox="0 0 44 50" aria-hidden="true" style={{ flexShrink: 0 }}>
              <polyline points="5,46 22,6 39,46" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="17" y="30" width="10" height="16" rx="2" fill="#FFC93C" />
            </svg>
            <span>bodified</span>
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
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
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