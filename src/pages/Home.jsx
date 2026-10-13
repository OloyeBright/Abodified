import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import HeroSection from '../components/HeroSection';
import Ticker from '../components/Ticker';
import ValueProps from '../components/ValueProps';
import ListingCard from '../components/ListingCard';
import StudentTips from '../components/StudentTips';
import HowItWorks from '../components/HowItWorks';
import Footer from '../components/Footer';
import Icon from '../components/Icon';

// contact_number and exact_address are NOT loaded on purpose
const PUBLIC_COLUMNS =
  'id, title, accommodation_type, rooms, rent_amount, rent_period, utilities, photo_url, photos, areas(name)';

const ROOM_TYPES = ['Self contain', 'Mini flat', 'Single room', 'Room & parlour'];

export default function Home() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('listings')
        .select(PUBLIC_COLUMNS)
        .eq('status', 'ACTIVE')
        .gt('expires_at', new Date().toISOString())
        .limit(3);

      if (error) setErrorMsg(error.message);
      else setListings(data || []);

      const { data: areaRows } = await supabase.from('areas').select('name').order('name');
      setAreas((areaRows || []).map((a) => a.name));
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <HeroSection areas={areas} />
      <Ticker items={[...ROOM_TYPES, ...areas]} />
      <ValueProps />

      <section className="section featured" id="listings">
        <div className="section-heading section-heading--row">
          <div><span>AVAILABLE NOW</span><h2>Fresh places around Ikere.</h2></div>
          <button onClick={() => navigate('/browse')}>View all listings <Icon name="arrow" size={17} /></button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Loading rooms…</p>
        ) : errorMsg ? (
          <p className="error-box" style={{ margin: 0 }}>Could not load rooms: {errorMsg}</p>
        ) : listings.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>No active listings right now. Check back soon.</p>
        ) : (
          <div className="listing-grid">
            {listings.map((item) => <ListingCard key={item.id} item={item} />)}
          </div>
        )}
      </section>

      <StudentTips />
      <HowItWorks />
      <Footer />
    </>
  );
}