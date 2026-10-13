const tips = [
  { title: 'See it first', text: 'Visit the room in person. Photos can’t show the noise, the smell or the road at night.' },
  { title: 'Ask about light & water', text: 'Is the light steady? Is water from a tap, tank or well? Ask before you pay, not after.' },
  { title: 'No money on WhatsApp', text: 'Never send money to someone you haven’t met. Pay only after you’ve seen the room.' },
  { title: 'Get it in writing', text: 'Ask for a receipt showing the amount, the date and your name, signed by the owner.' },
];

export default function StudentTips() {
  return (
    <section className="section tips">
      <div className="section-heading">
        <span>BEFORE YOU PAY</span>
        <h2>Four things every student should do.</h2>
        <p>Finding a room is exciting. A few minutes of checking saves a whole session of stress.</p>
      </div>
      <div className="tips-grid">
        {tips.map((t, i) => (
          <article className="tip" key={t.title}>
            <b>{i + 1}</b>
            <h3>{t.title}</h3>
            <p>{t.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}