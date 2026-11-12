import { MobileReveal } from "@/components/marketing/MobileReveal";
import { LeadJourney } from "@/components/marketing/demo/LeadJourney";
import { ProductDemo } from "@/components/marketing/demo/ProductDemo";
import { GsapReveal } from "@/components/marketing/GsapReveal";
import { FAQSection, Footer, Pricing, DatabasePreview } from "@/components/marketing/Sections2";
import { Capabilities, HowItWorks } from "@/components/marketing/Sections1";
import { Hero } from "@/components/marketing/Hero";
import { Recognition, Statistics, TrustedBusinesses } from "@/components/marketing/Trust";

/* Homepage in the order of the brief: hero, search sources, trusted businesses, how it works, dashboard preview,
 * capabilities, reviews, verified statistics, recognition, pricing, FAQ, footer. */
export default function Landing() {
  return (
    <div className="tl-home">
      <MobileReveal />
      <Hero />
      <TrustedBusinesses />
      <HowItWorks />
      <ProductDemo />
      <DatabasePreview />
      <Capabilities />
      <LeadJourney />
      <Statistics />
      <Recognition />
      <Pricing />
      <GsapReveal />
      <FAQSection />
      <Footer />
    </div>
  );
}
