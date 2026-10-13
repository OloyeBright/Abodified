import { Link } from 'react-router-dom';
import { formatTag, periodLabel } from '../utils/helpers';
import Icon from './Icon';

// Which icon goes with which utility
const TAG_ICON = { water: 'water', prepaidMeter: 'bolt', security: 'shield', kitchenAccess: 'home', privateToilet: 'check' };

export default function ListingCard({ item }) {
  let tags = [];
  if (Array.isArray(item.utilities)) tags = item.utilities;
  else if (item.utilities && typeof item.utilities === 'object') {
    tags = Object.keys(item.utilities).filter((k) => item.utilities[k] === true);
  }

  const cover = item.photos?.[0] || item.photo_url;
  const rooms = item.rooms || 1;

  return (
    <Link to={`/listing/${item.id}`} className="listing-card">
      <div className="listing-card__image" style={{ background: 'var(--primary-pale)' }}>
        {cover && <img src={cover} alt={item.title} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <span className="verified"><Icon name="check" size={13} /> Active &amp; current</span>
      </div>
      <div className="listing-card__body">
        <div className="listing-card__meta">
          {item.accommodation_type || 'Self Contain'}<span>•</span>{rooms} room{rooms > 1 ? 's' : ''}
        </div>
        <h3 style={{ textTransform: 'capitalize' }}>{item.title}</h3>
        <p className="location"><Icon name="pin" size={16} />{item.areas?.name || 'Ikere Ekiti'}</p>
        <div className="amenities">
          {tags.slice(0, 3).map((t) => (
            <span key={t}><Icon name={TAG_ICON[t] || 'check'} size={15} />{formatTag(t)}</span>
          ))}
        </div>
        <div className="listing-card__footer">
          <strong>
            ₦{Number(item.rent_amount || 0).toLocaleString()} <small>/ {periodLabel[item.rent_period] || 'year'}</small>
          </strong>
          <span className="card-arrow"><Icon name="arrow" size={18} /></span>
        </div>
      </div>
    </Link>
  );
}