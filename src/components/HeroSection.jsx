import { Link } from 'react-router-dom';
import Icon from './Icon';

// Stock photo from the design. Replace with your own file later,
// e.g. put hero.jpg in the "public" folder and use src="/hero.jpg".
const HERO_IMG =
  'https://images.unsplash.com/photo-1657040899601-fbcc8f6486f6?auto=format&fit=crop&w=1200&q=85';

// areas comes from Home (loaded from your database)
export default function HeroSection({ areas = [] }) {
  return (
    <section className="hero">
      <div className="hero__copy">
        <h1>Find a place that’s <em>actually available.</em></h1>
        <p>
          Structured, current off-campus accommodation in Ikere Ekiti. Compare clearly, contact directly,
          and move with confidence.
        </p>
        <div className="hero__actions">
          <Link to="/browse" className="btn btn--primary">Browse Listings <Icon name="arrow" size={18} /></Link>
          <Link to="/post-listing" className="btn btn--secondary">Post a Room</Link>
        </div>

        {areas.length > 0 && (
          <div className="area-chips">
            <span>Jump to:</span>
            {areas.map((name) => (
              <Link key={name} to={`/browse?area=${encodeURIComponent(name)}`}>{name}</Link>
            ))}
          </div>
        )}

        <div className="trust-line">
          <span><Icon name="check" size={15} /> Reviewed listings</span>
          <span><Icon name="shield" size={15} /> Owner-managed</span>
          <span><Icon name="clock" size={15} /> 14-day freshness</span>
        </div>
      </div>

      <div className="hero__visual">
        <div className="sticker" aria-hidden="true"><strong>14</strong><span>day re-check on every room</span></div>
        <img
          src={HERO_IMG}
          alt="A bright, tidy student room"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement.classList.add('hero__visual--empty');
          }}
        />
        <div className="floating-card floating-card--top">
          <span className="float-icon"><Icon name="check" size={18} /></span>
          <div><strong>Recently confirmed</strong><small>Available today</small></div>
        </div>
        <div className="floating-card floating-card--bottom">
          <small>Self Contain</small>
          <strong>₦180,000 <em>/ year</em></strong>
          <span><Icon name="pin" size={14} /> Near BOUESTI Main Gate</span>
        </div>
      </div>
    </section>
  );
}