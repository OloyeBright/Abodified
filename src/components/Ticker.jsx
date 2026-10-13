// A moving strip of words. The list is repeated twice so the loop looks endless.
export default function Ticker({ items = [] }) {
  const words = items.length ? items : ['Self contain', 'Mini flat', 'Single room', 'Room & parlour'];
  const row = [...words, ...words];
  return (
    <div className="ticker-wrap" aria-hidden="true">
      <div className="ticker">
        <div className="ticker__track">
          {[...row, ...row].map((w, i) => <span key={i}>{w} ✦</span>)}
        </div>
      </div>
    </div>
  );
}