import { useNavigate, useLocation } from 'react-router-dom';

// A "Back" button at the top of every page except the home page.
// If there is no earlier page in this visit, it goes to the home page instead.
export default function BackBar() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/') return null;

  const canGoBack = location.key !== 'default';

  return (
    <div className="border-b border-brand-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-2">
        <button type="button" onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <span aria-hidden="true" className="text-xl leading-none">←</span>
          Back
        </button>
      </div>
    </div>
  );
}