import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import ListingCard from '../components/ListingCard';
import Icon from '../components/Icon';
   import { useSearchParams } from 'react-router-dom';

const ROOM_TYPES = ['Single Room', 'Self Contain', 'Mini Flat', 'Room & Parlour'];

const PUBLIC_COLUMNS =
  'id, title, accommodation_type, rooms, rent_amount, rent_period, utilities, photo_url, photos, areas(name)';

// Compare monthly and yearly rents fairly: everything becomes "per year"
const perYear = (l) => (l.rent_period === 'monthly' ? Number(l.rent_amount) * 12 : Number(l.rent_amount));

export default function Browse() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false); // mobile filter sheet

  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  const [area, setArea] = useState(params.get('area') || '');
  const [type, setType] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [rooms, setRooms] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('listings')
        .select(PUBLIC_COLUMNS)
        .eq('status', 'ACTIVE')
        .gt('expires_at', new Date().toISOString());
      if (error) setErrorMsg(error.message);
      else setListings(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const areaOptions = useMemo(
    () => [...new Set(listings.map((l) => l.areas?.name).filter(Boolean))],
    [listings]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (q && !(l.title.toLowerCase().includes(q) || (l.areas?.name || '').toLowerCase().includes(q))) return false;
      if (area && l.areas?.name !== area) return false;
      if (type && l.accommodation_type !== type) return false;
      if (minRent && perYear(l) < Number(minRent)) return false;
      if (maxRent && perYear(l) > Number(maxRent)) return false;
      if (rooms && (rooms === '3' ? (l.rooms || 1) < 3 : (l.rooms || 1) !== Number(rooms))) return false;
      return true;
    });
  }, [listings, search, area, type, minRent, maxRent, rooms]);

  const hasFilters = search || area || type || minRent || maxRent || rooms;
  function clearAll() {
    setSearch(''); setArea(''); setType(''); setMinRent(''); setMaxRent(''); setRooms('');
  }
  const digits = (v) => v.replace(/\D/g, '');

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <span className="kicker">IKERE EKITI ONLY</span>
          <h1>Find your next place</h1>
          <p>Only active, recently confirmed listings are shown.</p>
        </div>
        <span className="result-count">{filtered.length} place{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="search-bar">
        <label>
          <Icon name="search" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, area or landmark" />
        </label>
        <button type="button" className="mobile-filter" onClick={() => setSheetOpen(true)}>
          <Icon name="filter" /> Filters
        </button>
      </div>

      <div className={`filters ${sheetOpen ? 'filters--open' : ''}`}>
        <div className="sheet-head">
          <strong>Filter listings</strong>
          <button type="button" onClick={() => setSheetOpen(false)}><Icon name="close" /></button>
        </div>
        <label>Area
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {areaOptions.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label>Accommodation
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Min rent / year
          <div className="input-prefix"><span>₦</span>
            <input value={minRent} onChange={(e) => setMinRent(digits(e.target.value))} placeholder="50000" inputMode="numeric" />
          </div>
        </label>
        <label>Max rent / year
          <div className="input-prefix"><span>₦</span>
            <input value={maxRent} onChange={(e) => setMaxRent(digits(e.target.value))} placeholder="350000" inputMode="numeric" />
          </div>
        </label>
        <label>Rooms
          <select value={rooms} onChange={(e) => setRooms(e.target.value)}>
            <option value="">Any</option>
            <option value="1">1 room</option>
            <option value="2">2 rooms</option>
            <option value="3">3+ rooms</option>
          </select>
        </label>
        <button type="button" className="btn btn--secondary apply-filter" onClick={() => setSheetOpen(false)}>Show results</button>
      </div>

      <div className="filter-chips">
        <span>Active listings only <Icon name="check" size={14} /></span>
        {hasFilters && <button type="button" onClick={clearAll}>Clear filters</button>}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 0' }}>Loading rooms…</p>
      ) : errorMsg ? (
        <p className="error-box" style={{ margin: 0 }}>Could not load rooms: {errorMsg}</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span><Icon name="search" size={30} /></span>
          <h2>No places match those filters</h2>
          <p>Try widening your price range or choosing another area in Ikere Ekiti.</p>
          {hasFilters && <button type="button" className="btn btn--secondary" onClick={clearAll}>Clear filters</button>}
        </div>
      ) : (
        <div className="listing-grid listing-grid--browse">
          {filtered.map((item) => <ListingCard key={item.id} item={item} />)}
        </div>
      )}

      {sheetOpen && <div className="scrim" onClick={() => setSheetOpen(false)} />}
    </main>
  );
}