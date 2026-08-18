import { Hero } from '../landing/hero';
import { ConnectSection, PathSection, FinalSection, LandingFooter } from '../landing/sections';
import '../landing/sections/sections.css';

export function LandingPage() {
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
