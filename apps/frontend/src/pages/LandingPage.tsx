import { Hero } from '../landing/hero';
import { LiveLandingPage } from '../landing/live';
import { ConnectSection, PathSection, FinalSection, LandingFooter } from '../landing/sections';
import { useAuth } from '../auth/AuthContext';
import '../landing/sections/sections.css';

export function LandingPage() {
  const { user, loading } = useAuth();

  // Logged-in users see the live platform map
  if (user) {
    return <LiveLandingPage />;
  }

  // While resolving a stored session, avoid flashing the public marketing page
  if (loading) {
    return (
      <div className="home-shell">
        <div className="assist-note">…</div>
      </div>
    );
  }

  // Guests get the intro / marketing landing
  return (
    <>
      <Hero />
      <ConnectSection />
      <PathSection />
      <FinalSection />
      <LandingFooter />
    </>
  );
}
