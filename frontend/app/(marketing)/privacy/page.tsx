import Link from "next/link";
import { Footer } from "@/components/marketing/Sections2";

export const metadata = { title: "Privacy" };
export default function Privacy() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <p className="label mb-3 text-forest">Legal</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Privacy notice</h1>
        <p className="mt-3 rounded-xl border border-gold/50 bg-gold/15 p-3 text-sm text-gold-text">Starter text for the operator of this deployment. Have it reviewed against your own processing before you launch — it is not legal advice.</p>
        <div className="mt-8 space-y-6 text-[15.5px] leading-relaxed text-mute [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-ink">
          <section><h2>What TubeLead processes</h2><p>Your account details (email, display name), the discovery criteria you save, and the creator records you collect. Creator records contain only information that is public on YouTube (channel name, statistics, description) and business contact routes the creator published themselves on their channel or official website. TubeLead does not obtain private email addresses.</p></section>
          <section><h2>Third parties</h2><p>Discovery uses the YouTube Data API (Google). Payments are processed by Stripe; TubeLead never sees full card numbers. If you connect an AI provider, the text of your request (for example a channel description you asked it to summarise) is sent to that provider under your own account and API key; your key is stored encrypted and is never shown back.</p></section>
          <section><h2>Your data</h2><p>Records are private to your account. You can export your leads (paid plans), delete creators, disconnect AI providers (the stored key is deleted) and cancel your subscription at any time.</p></section>
          <section><h2>Contacting creators</h2><p>A publicly listed business address is not consent. You are responsible for complying with the rules that apply to you and the recipient (for example UK PECR and UK GDPR, EU GDPR/ePrivacy, CAN-SPAM) before any outreach.</p></section>
        </div>
        <Link href="/" className="btn-ghost mt-10">Back to home</Link>
      </article>
      <Footer />
    </>
  );
}
