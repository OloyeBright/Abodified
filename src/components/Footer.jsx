import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link to="/" className="logo">
            <span className="logo__mark"><Icon name="home" size={18} /></span>
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