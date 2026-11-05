import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// A banner for logged-in users whose profile is not saved yet. It does not block the site.
// It asks the database whether the signed-in user's profile is locked, every time the page changes.
export default function AccountTypeGate() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;

    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (alive) setShow(false);
        return;
      }
      const { data, error } = await supabase.rpc('is_profile_complete');
      if (alive) setShow(!error && data !== true);
    }

    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname]);

  if (!show || pathname === '/settings') return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-brand-950 p-4 text-white shadow-2xl sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-bold">Set up your profile</p>
        <p className="text-sm text-white/80">
          Add your picture, your name, and whether you are a student, agent or landlord. You save it once.
        </p>
      </div>
      <Link to="/settings" className="shrink-0 rounded-xl bg-coral-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-coral-600">
        Set up my profile
      </Link>
    </div>
  );
}