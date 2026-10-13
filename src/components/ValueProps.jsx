import Icon from './Icon';

const items = [
  { n: '01', icon: 'search', title: 'Structured Discovery',
    text: 'Every room uses the same details, so comparing price, utilities and location is simple.' },
  { n: '02', icon: 'clock', title: 'Listing Integrity',
    text: 'Only approved, active listings appear. Availability is reconfirmed every 14 days.' },
  { n: '03', icon: 'shield', title: 'Enforced Ownership',
    text: 'Only verified listing owners or an administrator can make changes.' },
];

export default function ValueProps() {
  return (
    <section className="section why">
      <div className="section-heading">
        <span>WHY ABODIFIED</span>
        <h2>Housing search, with the guesswork removed.</h2>
        <p>Every part of the platform is designed to help students make safer, clearer decisions.</p>
      </div>
      <div className="value-grid">
        {items.map((it) => (
          <article key={it.n}>
            <span className="value-icon"><Icon name={it.icon} /></span>
            <h3>{it.title}</h3>
            <p>{it.text}</p>
            <small>{it.n}</small>
          </article>
        ))}
      </div>
    </section>
  );
}