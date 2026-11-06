// Shows a photo EXACTLY as the owner took it: nothing is cropped.
// The photo sits in the middle. A blurred copy of the same photo fills any empty space.
export default function PhotoFrame({ src, alt = '', className = '' }) {
  return (
    <div className={`photo-frame ${className}`}>
      <img src={src} alt="" aria-hidden="true" className="photo-frame__bg" />
      <img src={src} alt={alt} className="photo-frame__img" />
    </div>
  );
}