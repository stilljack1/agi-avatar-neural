// ─────────────────────────────────────────────────────────
//  AGI-1 — Terms of Service (v1.0)
// ─────────────────────────────────────────────────────────
import { CURRENT_POLICY_VERSIONS, POLICY_EFFECTIVE_DATE } from '@/lib/policyVersions';

export const metadata = { title: 'Terms of Service — AGI-1' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <a href="/register" className="text-white/30 hover:text-white/60 text-sm mb-6 inline-block">&larr; Back</a>
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-white/40 text-sm mb-8">
          Version {CURRENT_POLICY_VERSIONS.terms} — Effective {POLICY_EFFECTIVE_DATE}
        </p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-white/60 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white/80">1. Acceptance of Terms</h2>
            <p>By creating an account on AGI-1, you agree to be bound by these Terms of Service. If you do not agree, you must not use the service. AGI-1 is operated by Fair Group AI.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">2. Description of Service</h2>
            <p>AGI-1 provides artificial general intelligence interfaces including real-time avatar interaction (Jack and Julia), task execution via Singularity, and related AI-powered productivity tools.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">3. Consent Bundle & Feature Permissions</h2>
            <p>Account creation requires acknowledgement of the Terms, Privacy Policy, and the AGI-1 Data Collection Breakdown. This signup acknowledgement does not automatically grant camera, microphone, device control, payments, or connector access. Those permissions are requested later when you use the feature.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">4. Account Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You must be at least 18 years old to use this service. You agree to provide accurate information during registration.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">5. Acceptable Use</h2>
            <p>You may not use AGI-1 for illegal activities, to generate harmful content, to impersonate others, or to attempt to compromise the service. Fair Group AI reserves the right to suspend accounts that violate these terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">6. Subscriptions & Billing</h2>
            <p>Certain features require a paid subscription. Billing is processed via Stripe. You can cancel your subscription at any time from your account settings. Refund policies are handled per applicable law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">7. Intellectual Property</h2>
            <p>Content you create using AGI-1 belongs to you. The AGI-1 platform, its design, code, and AI models remain the property of Fair Group AI.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">8. Limitation of Liability</h2>
            <p>AGI-1 is provided &ldquo;as is.&rdquo; Fair Group AI is not liable for indirect, incidental, or consequential damages arising from your use of the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">9. Modifications</h2>
            <p>We may update these Terms. You will be notified of material changes. Continued use constitutes acceptance of updated Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">10. Contact</h2>
            <p>Questions? Contact us at <a href="mailto:legal@fairgroupai.com" className="text-[#0077FF] underline">legal@fairgroupai.com</a> or visit <a href="https://www.fairgroupai.com" className="text-[#0077FF] underline" target="_blank">fairgroupai.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
