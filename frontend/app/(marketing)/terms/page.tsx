import Link from "next/link";
import { Footer } from "@/components/marketing/Sections2";

export const metadata = { title: "Terms" };
export default function Terms() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <p className="label mb-3 text-forest">Legal</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Terms of use</h1>
        <p className="mt-3 rounded-xl border border-gold/50 bg-gold/15 p-3 text-sm text-gold-text">Starter text for the operator of this deployment. Have it reviewed before launch — it is not legal advice.</p>
        <div className="mt-8 space-y-6 text-[15.5px] leading-relaxed text-mute [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-ink">
          <section><h2>The service</h2><p>TubeLead helps you discover public YouTube channels and organise publicly published business contact routes. It is not affiliated with or endorsed by YouTube or Google. Your use of YouTube data must comply with the YouTube API Services Terms of Service.</p></section>
          <section><h2>Acceptable use</h2><p>Do not use TubeLead to send unsolicited bulk messages, harass creators, or collect data you are not permitted to process. Quota and plan limits protect the service for everyone and are enforced by the server.</p></section>
          <section><h2>Plans and billing</h2><p>Paid plans are billed through Stripe and renew until cancelled. Allowances and features are listed on the pricing section and in Billing &amp; Subscription. Cancelling keeps your plan until the end of the paid period.</p></section>
          <section><h2>No guarantees about contact data</h2><p>Routes are shown with their source and status. “Publicly published” means we found it on a public page; it does not guarantee the address is current or deliverable.</p></section>
        </div>
        <Link href="/" className="btn-ghost mt-10">Back to home</Link>
      </article>
      <Footer />
    </>
  );
}
