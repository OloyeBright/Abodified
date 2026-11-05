import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const ROLE_LABEL = { LANDLORD: 'Landlord', AGENT: 'Agent', STUDENT: 'Student' };

function avatarUrl(path) {
  return path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'A';
}

// Shows who posted the room: name (links to their profile), their role for this room, and reviews.
export default function PosterByline({ poster, posterType }) {
  if (!poster) return null;
  const url = avatarUrl(poster.avatar_path);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {url ? (
        <img src={url} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
          {initials(poster.display_name)}
        </span>
      )}
      <span>
        Posted by{' '}
        <Link to={`/u/${poster.user_id}`} className="font-semibold text-brand-700 underline">
          {poster.display_name}
        </Link>
      </span>
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
        {ROLE_LABEL[posterType] || 'Poster'}
      </span>
      {poster.review_count > 0 ? (
        <span className="text-xs text-brand-900/70">★ {poster.rating_avg} ({poster.review_count} review{poster.review_count > 1 ? 's' : ''})</span>
      ) : (
        <span className="text-xs text-brand-900/60">No reviews yet</span>
      )}
    </div>
  );
}