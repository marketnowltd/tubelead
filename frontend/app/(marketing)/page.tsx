import { Hero } from "@/components/marketing/Hero";
import { AIIntegrations, Campaigns, DatabasePreview, FAQSection, FinalCTA, Footer, Pricing } from "@/components/marketing/Sections2";
import { Capabilities, CreatorStrip, GeneratorDemo, HowItWorks } from "@/components/marketing/Sections1";

export default function Landing() {
  return (
    <>
      <Hero />
      <CreatorStrip />
      <GeneratorDemo />
      <HowItWorks />
      <Capabilities />
      <AIIntegrations />
      <DatabasePreview />
      <Campaigns />
      <Pricing />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </>
  );
}
