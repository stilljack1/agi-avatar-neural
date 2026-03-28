// ─────────────────────────────────────────────────────────
//  AGI-1 — User Agreement (v1.0)
// ─────────────────────────────────────────────────────────
export const metadata = { title: 'User Agreement — AGI-1' };

export default function AgreementPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <a href="/register" className="text-white/30 hover:text-white/60 text-sm mb-6 inline-block">&larr; Back</a>
        <h1 className="text-3xl font-bold mb-2">User Agreement</h1>
        <p className="text-white/40 text-sm mb-8">Version 2026-03-28.1 — Effective March 26, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-white/60 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white/80">1. Purpose</h2>
            <p>This User Agreement governs your relationship with AGI-1, a product of Fair Group AI. It supplements the Terms of Service and Privacy Policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">2. Avatar Interactions</h2>
            <p>AGI-1 provides AI-powered avatar companions (Jack and Julia) for real-time interaction. These are artificial intelligence systems, not real people. Interactions may be recorded for service improvement if you have opted in.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">3. Task Execution</h2>
            <p>Singularity task execution operates with safety guardrails (Aegis). Tasks are executed on your behalf based on your instructions. You are responsible for the instructions you provide. AGI-1 will not execute tasks that violate applicable law or these agreements.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">4. Camera & Microphone</h2>
            <p>Real-time video/voice interactions require camera and microphone access. These permissions are requested just-in-time when you initiate a live session — not during initial signup. You can revoke these permissions at any time via your browser settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">5. Data Processing Consent</h2>
            <p>By using AGI-1, you acknowledge that the system processes your account data, session data, product usage data, execution traces, and runtime safety logs to provide the service. Signup uses a single consent bundle acknowledgement for the legal/data breakdown display, but live feature permissions remain separate and just-in-time.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">6. OpenClaw V2 & Aegis</h2>
            <p>OpenClaw V2 operates only through supported, user-authorized, revocable control paths. Aegis monitors background execution, intervention history, and policy enforcement. Device-control permissions are not implied by signup and must be granted later when the feature is used.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">7. Community Membership</h2>
            <p>Becoming a member of the AGI-1 family or participating in community features is optional. Community communications can be opted in or out at any time.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white/80">8. Contact</h2>
            <p>For questions about this agreement: <a href="mailto:legal@fairgroupai.com" className="text-[#0077FF] underline">legal@fairgroupai.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
