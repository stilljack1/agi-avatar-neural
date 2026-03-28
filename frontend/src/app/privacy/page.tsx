// ─────────────────────────────────────────────────────────
//  AGI-1 — Privacy Policy (v1.0)
// ─────────────────────────────────────────────────────────
import { CURRENT_POLICY_VERSIONS, POLICY_EFFECTIVE_DATE } from '@/lib/policyVersions';

export const metadata = { title: 'Privacy Policy — AGI-1' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <a href="/register" className="text-white/30 hover:text-white/60 text-sm mb-6 inline-block">&larr; Back</a>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-white/40 text-sm mb-8">
          Version {CURRENT_POLICY_VERSIONS.privacy} — Effective {POLICY_EFFECTIVE_DATE}
        </p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-white/60 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white/80">1. Who We Are</h2>
            <p>AGI-1 is operated by Fair Group AI. This policy explains what data we collect, why, and how you can control it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">2. Data We Collect</h2>
            <h3 className="text-sm font-semibold text-white/70 mt-3">A. Identity & Account Data</h3>
            <p>Name, email, authentication provider, phone number if provided, and profile/account settings.</p>
            <h3 className="text-sm font-semibold text-white/70 mt-3">B. Biometric & Live Interaction Data</h3>
            <p>Real-time voice/video streams, voice interaction metadata, and live session state when you use Jack or Julia live interaction features.</p>
            <h3 className="text-sm font-semibold text-white/70 mt-3">C. Device & Telemetry Data (OpenClaw V2)</h3>
            <p>Supported device permission states, OS/runtime telemetry, hardware utilization, and network/runtime status needed for supported automation flows.</p>
            <h3 className="text-sm font-semibold text-white/70 mt-3">D. Execution & Background Logs (Aegis)</h3>
            <p>Safety logs, execution state, intervention history, and operational traces needed to keep the system policy-bound and observable.</p>
            <h3 className="text-sm font-semibold text-white/70 mt-3">E. Agentic Memory & Behavioral Data</h3>
            <p>Sessions, chat history, task history, research state, uploads/image metadata, diagnostics, and settings/preferences.</p>
            <h3 className="text-sm font-semibold text-white/70 mt-3">F. Financial & Transactional Data</h3>
            <p>Subscription tier, billing state, receipt metadata, tips, and donation records. Payment processing is handled by Stripe; we do not store raw card numbers.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">3. How We Use Your Data</h2>
            <p>Core service: to provide AGI-1 (avatar interaction, task execution, account management). Optional: marketing communications, personalization, model improvement — only if you opt in.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">4. Data Storage</h2>
            <p>Your data is stored in AWS DynamoDB (US-East-1 region). Passwords are hashed with bcrypt (12 rounds). We use TLS for all data in transit.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">5. Third Parties</h2>
            <p>We share data with: Stripe (payments), AWS (infrastructure), and LiveKit (real-time video/voice). We do not sell your data to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">6. Just-In-Time Permissions</h2>
            <p>Camera, microphone, OpenClaw device-control access, Gmail, Drive, Calendar, Sheets, payment authorization, and financial account linking are not granted at signup. They are requested only when you enable the specific feature and can be revoked later.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">7. Your Rights</h2>
            <p>You may: view your consent choices, update optional consents, request a data export, request account deletion. Visit <a href="/settings/privacy" className="text-[#0077FF] underline">Settings &gt; Privacy</a> to manage these.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">8. Cookies</h2>
            <p>We use essential cookies for authentication and session management. The welcome video sets a <code className="bg-white/5 px-1 rounded text-xs">agi1_welcome_seen</code> cookie to track whether you have seen it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">9. Data Retention</h2>
            <p>Account data is retained while your account is active. Consent records are retained for audit purposes. If you delete your account, personal data is removed within 30 days.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">10. Changes to This Policy</h2>
            <p>We will notify you of material changes. The version number and effective date are displayed above.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">11. Contact</h2>
            <p>Privacy inquiries: <a href="mailto:privacy@fairgroupai.com" className="text-[#0077FF] underline">privacy@fairgroupai.com</a> or visit <a href="https://www.fairgroupai.com" className="text-[#0077FF] underline" target="_blank">fairgroupai.com</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
