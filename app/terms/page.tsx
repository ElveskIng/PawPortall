// app/terms/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions • PawPortal",
  description:
    "Read PawPortal’s Terms & Conditions—responsible use, listings policy, moderation, and user responsibilities for ethical pet adoption.",
};

export default function TermsPage() {
  return (
    <main className="min-h-[70vh] bg-gradient-to-b from-white via-white to-white">
      {/* Header band */}
      <section className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white">
        <div className="mx-auto w-full max-w-5xl px-5 py-10">
          <h1 className="text-3xl font-bold tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="mt-1 text-white/90 text-sm">
            Effective date: October 24, 2025
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto w-full max-w-5xl px-5 py-10">
        <div className="space-y-8 text-[15px] leading-7 text-zinc-800">
          <p>
            Welcome to <strong>PawPortal</strong>, a bridging platform for
            ethical pet adoption in the Philippines. By accessing or using this
            site, you agree to the Terms below. If you disagree with any part,
            please discontinue use of the platform.
          </p>

          {/* 1 */}
          <Section title="1) Acceptance of Terms">
            <p>
              Your access and use of PawPortal constitute agreement to these
              Terms and to any policies referenced here (including the{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>
              ). If you use PawPortal on behalf of an organization, you
              represent that you are authorized to accept these Terms for that
              organization.
            </p>
          </Section>

          {/* 2 */}
          <Section title="2) Eligibility">
            <ul className="list-disc pl-6 space-y-1">
              <li>You must be at least 18 years old to use the platform.</li>
              <li>
                You agree to follow applicable Philippine laws and local
                ordinances related to animal welfare and online conduct.
              </li>
            </ul>
          </Section>

          {/* 3 */}
          <Section title="3) Accounts &amp; Security">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Provide accurate, current, and complete information during
                registration.
              </li>
              <li>
                You are responsible for safeguarding your password and all
                activity under your account.
              </li>
              <li>
                PawPortal may suspend or terminate accounts that are compromised
                or violate these Terms.
              </li>
            </ul>
          </Section>

          {/* 4 */}
          <Section title="4) Allowed &amp; Prohibited Content">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Keep posts respectful, accurate, and relevant to adoption. No
                spam, scams, hate, harassment, pornography, or violent/graphic
                content.
              </li>
              <li>
                Pet photos and details must be truthful and represent the real
                animal being listed.
              </li>
              <li>
                Do not post anything unlawful or that violates the{" "}
                <em>Animal Welfare Act of the Philippines</em>.
              </li>
              <li>
                PawPortal may review, filter, edit, or remove content that
                violates these Terms or platform policies.
              </li>
            </ul>
          </Section>

          {/* 5 */}
          <Section title="5) Listings &amp; Adoption Policy">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                PawPortal is a <strong>bridge</strong> connecting pet owners and
                adopters. PawPortal does not own, house, or vet animals listed
                on the platform.
              </li>
              <li>
                PawPortal does not guarantee a pet’s health, behavior, or
                suitability. Users should verify information, request veterinary
                records if available, and meet responsibly.
              </li>
              <li>
                All handovers must follow humane practices and comply with
                applicable laws and regulations set by your Local Government
                Unit (LGU) and national agencies.
              </li>
            </ul>
          </Section>

          {/* 6 */}
          <Section title="6) Messaging &amp; Conduct">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Use the messaging feature only for legitimate adoption-related
                communication.
              </li>
              <li>
                Do not engage in harassment, impersonation, phishing, or
                solicitation of unrelated products or services.
              </li>
            </ul>
          </Section>

          {/* 7 */}
          <Section title="7) Verification &amp; Moderation">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                PawPortal may request additional verification (e.g., IDs or
                documents) to enable certain features or to investigate reports.
              </li>
              <li>
                PawPortal may suspend or ban accounts involved in fraud, animal
                cruelty, repeated policy violations, or actions that threaten
                user safety.
              </li>
            </ul>
          </Section>

          {/* 8 - Account Suspension */}
          <Section title="8) Account Suspension and Violation Policy 😎">
            <p>
              To maintain a safe and trustworthy platform, PawPortal enforces{" "}
              <strong>direct suspension</strong> for users who violate these
              Terms or platform rules. Users are expected to read and understand
              the rules before using the platform.{" "}
              <strong>No prior warning is required.</strong>
            </p>

            <h3 className="text-base font-semibold text-zinc-900 mt-3">
              Actions Leading to Suspension or Termination
            </h3>
            <div className="space-y-3 mt-2">
              <div>
                <p className="font-medium">
                  1. Providing False or Misleading Information
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Using fake names, photos, or pet credentials.</li>
                  <li>Misrepresenting a pet’s breed, health, or condition.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">2. Fraudulent or Illegal Activities</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    Selling pets or charging hidden fees through the platform.
                  </li>
                  <li>
                    Engaging in scams or phishing attempts targeting other
                    users.
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-medium">3. Inappropriate Behavior</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    Harassing, threatening, or using abusive language toward
                    other users or admins.
                  </li>
                  <li>
                    Posting explicit, violent, or discriminatory content.
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-medium">4. Spamming or Misuse of Features</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Sending or posting irrelevant or repetitive content.</li>
                </ul>
              </div>
            </div>

            <h3 className="text-base font-semibold text-zinc-900 mt-4">
              Violation and Enforcement
            </h3>
            <p className="mt-1">
              PawPortal may apply the following actions depending on the case.
              For any confirmed violation of the rules,{" "}
              <strong>no warning is required</strong>; suspension is applied
              immediately based on the number of offenses.
            </p>
            <ol className="list-decimal pl-6 space-y-3 mt-2">
              <li>
                <p className="font-medium">
                  First Offense – 3-Day Suspension
                </p>
                <p className="text-sm text-zinc-700">
                  On the first confirmed violation, the account is suspended for
                  up to three (3) days. During this period, the user cannot
                  access the platform or use any features.
                </p>
              </li>
              <li>
                <p className="font-medium">
                  Second Offense – 1-Week Suspension
                </p>
                <p className="text-sm text-zinc-700">
                  On the second confirmed violation, the account is suspended
                  for seven (7) days. Access is fully blocked for the duration
                  of the suspension.
                </p>
              </li>
              <li>
                <p className="font-medium">
                  Third Offense – 1-Month Suspension
                </p>
                <p className="text-sm text-zinc-700">
                  On the third confirmed violation, the account is suspended for
                  thirty (30) days. PawPortal may review the case and decide if
                  additional conditions will apply before reactivation.
                </p>
              </li>
              <li>
                <p className="font-medium">
                  Fourth Offense – Long-Term Suspension (1,826 Days / 5 Years)
                </p>
                <p className="text-sm text-zinc-700">
                  On the fourth confirmed violation, the account is suspended
                  for approximately one thousand eight hundred twenty-six
                  (1,826) days, equivalent to five (5) years. In serious cases,
                  PawPortal may also block the user from creating new accounts
                  or escalate to a permanent ban.
                </p>
              </li>
            </ol>
          </Section>

          {/* 9 */}
          <Section title="9) Privacy &amp; Data">
            <p>
              PawPortal processes personal data in accordance with its{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>
              . PawPortal does <strong>not</strong> sell personal data. By using
              the platform, you consent to such data processing.
            </p>
          </Section>

          {/* 10 */}
          <Section title="10) Intellectual Property">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                All trademarks, logos, user interface designs, and source code
                are owned by PawPortal and protected by applicable law.
              </li>
              <li>
                You retain ownership of your uploaded content but grant
                PawPortal a non-exclusive license to host, display, and
                distribute it as necessary for platform operation.
              </li>
            </ul>
          </Section>

          {/* 11 */}
          <Section title="11) Third-Party Links &amp; Services">
            <p>
              The platform may contain links to third-party websites or
              services. PawPortal is not responsible for the content, policies,
              or availability of such external resources. Access them at your
              own discretion.
            </p>
          </Section>

          {/* 12 */}
          <Section title="12) Limitation of Liability">
            <p>
              PawPortal is provided “as is.” To the fullest extent permitted by
              law, PawPortal and its team are not liable for indirect,
              incidental, special, consequential, or exemplary damages; disputes
              between users; or any loss resulting from listings, messages, or
              service interruptions.
            </p>
          </Section>

          {/* 13 */}
          <Section title="13) Indemnity">
            <p>
              You agree to indemnify and hold harmless PawPortal, its
              developers, and affiliates from any claims, damages, or
              liabilities arising from your use of the platform, your content,
              or your violation of these Terms or any applicable law.
            </p>
          </Section>

          {/* 14 */}
          <Section title="14) Changes to Terms">
            <p>
              PawPortal may update these Terms periodically. Changes take effect
              once posted here. Continued use after revisions means you accept
              the updated Terms.
            </p>
          </Section>

          {/* 15 */}
          <Section title="15) Contact">
            <p>
              For questions or concerns, contact:{" "}
              <a
                href="mailto:support@pawportal.ph"
                className="underline underline-offset-4"
              >
                pawportal@gmail.com
              </a>
              <br />
              Lipa City, Batangas, Philippines
            </p>
          </Section>

          <p className="text-sm text-zinc-500">
            © 2025 PawPortal. All rights reserved.
          </p>
        </div>
      </section>
    </main>
  );
}

/** Small helper for consistent section layout */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-fuchsia-700">{title}</h2>
      <div className="text-zinc-800">{children}</div>
    </section>
  );
}
