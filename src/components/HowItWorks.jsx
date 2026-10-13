import Icon from './Icon';

export default function HowItWorks() {
  return (
    <section className="how">
      <div><span>01</span><Icon name="search" /><h3>Search</h3><p>Filter by area, room type and your budget.</p></div>
      <i />
      <div><span>02</span><Icon name="more" /><h3>Compare</h3><p>Review the same clear details on every listing.</p></div>
      <i />
      <div><span>03</span><Icon name="whatsapp" /><h3>Contact</h3><p>Connect with the owner directly on WhatsApp.</p></div>
    </section>
  );
}