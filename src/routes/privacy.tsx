import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import {
  GrievanceCard,
  LegalPage,
  type LegalSection,
} from "@/components/LegalPage";
import { emailLink, LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({ component: Privacy });

const SUMMARY = [
  "We collect what you log so the app can work — nothing is sold, and there are no ads.",
  "Meal photos and voice clips are sent to AI to identify food, then discarded. Progress photos stay private to you.",
  "Partners you join through see only your name, plan and expiry — never your food, weight or health logs.",
  "Your data is stored in India (Mumbai region). Export it or delete it any time.",
  `Questions or complaints: Grievance Officer, ${LEGAL.grievanceEmail}.`,
];

const SHARING: [string, string, string][] = [
  [
    "Supabase",
    "All app data (database, login, private photo storage)",
    "Hosting our database, Mumbai region",
  ],
  [
    "Vercel",
    "Requests passing through our servers",
    "Hosting the website and server functions",
  ],
  [
    "Razorpay",
    "Your email, plan, payment details you enter with them",
    "Website payments, mandates and refunds",
  ],
  [
    "Google Play / Apple App Store",
    "Your store purchase and subscription status",
    "In-app purchases, renewals and refunds",
  ],
  [
    "Google (Gemini) and Groq",
    "Food text, meal photos, voice, weekly stats, workout preferences",
    "AI features",
  ],
  ["Google Sign-In", "Your Google account identity", "Login, if you choose it"],
  ["Open Food Facts", "Only the barcode number", "Product lookup"],
  [
    "YouTube",
    "Standard YouTube data when you play an exercise video",
    "Exercise demonstrations",
  ],
  [
    "Gym / clinic / creator partner you joined through or linked",
    "Name, plan and expiry, payments made through their code, and gym membership phone and dates if you add them",
    "Membership and commission",
  ],
  [
    "Other Dombelz users",
    "Name or username, initials, streaks, XP, achievements",
    "Only if you use community features",
  ],
  ["Authorities", "What the law requires", "Legal obligations"],
];

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        Dombelz is operated by <strong>{LEGAL.legalName}</strong>,{" "}
        {LEGAL.address} ("we", "us"). We are the Data Fiduciary for your
        personal data under India's Digital Personal Data Protection Act, 2023
        (DPDP Act). This policy covers the Dombelz website ({LEGAL.website}),
        web app and Android/iOS apps.
      </p>
    ),
  },
  {
    id: "collect",
    title: "Data we collect",
    body: (
      <>
        <p>
          <strong>Account:</strong> name, email, username, and your password
          (stored only as a secure hash) or your Google sign-in identity.
        </p>
        <p>
          <strong>Profile and goals:</strong> age, gender, height, weight, goal
          weight, activity level, fitness goal, diet preference, meal frequency
          and meal names, water goal and cup size, supplements you use, time
          zone, and WhatsApp number if you choose to give it.
        </p>
        <p>
          <strong>What you log:</strong> food diary entries, saved meals and
          recipes, water intake, weight entries, progress photos, body
          measurements, workout plans, workout and cardio logs, streaks, XP and
          achievements.
        </p>
        <p>
          <strong>Health readings:</strong> blood pressure and blood glucose
          readings you add to the Health Log, and the condition you choose to
          track. These are sensitive — we use them only to show your history and
          reference-range labels to you.
        </p>
        <p>
          <strong>Media you choose to share:</strong> meal photos and voice
          clips for AI food logging, and camera input for barcode scanning. Meal
          photos and voice clips are processed to identify food and are{" "}
          <strong>not stored</strong>. Progress photos are stored privately and
          are visible only to you.
        </p>
        <p>
          <strong>Social and rewards:</strong> friends, cheers, leaderboard
          scores, your referral code and who you referred, and any gym, clinic
          or creator partner code you used — plus gym membership details (plan,
          dates, phone number) if you add them.
        </p>
        <p>
          <strong>Payments:</strong> plan, subscription status, payment amounts
          and dates, refund requests and their reasons. Card, UPI and bank
          details are handled by Razorpay, Google Play or Apple; we never see or
          store them.
        </p>
        <p>
          <strong>Reminders:</strong> your notification settings and custom
          reminders. Reminders are scheduled on your phone; we run no
          push-notification server.
        </p>
        <p>
          <strong>Technical:</strong> error and diagnostic information needed to
          keep the service running (for example a failed request and your user
          ID).
        </p>
        <p>
          We do <strong>not</strong> collect your precise location, contacts,
          SMS or call logs, and we use no third-party advertising or analytics
          trackers.
        </p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "Why we use it (purposes)",
    body: (
      <>
        <ul>
          <li>
            Run your account and calculate your calorie, macro, fibre and water
            targets.
          </li>
          <li>
            Show your progress, streaks, achievements and AI weekly report.
          </li>
          <li>Identify food from text, photos, voice and barcodes.</li>
          <li>
            Run community features you join (leaderboard, friends, cheers).
          </li>
          <li>
            Run Refer &amp; Earn and partner codes, including partner
            commission.
          </li>
          <li>Process payments, refunds and access to paid features.</li>
          <li>Send reminders you set up.</li>
          <li>
            Give support, prevent fraud and abuse, keep the service secure, and
            meet legal and tax obligations.
          </li>
        </ul>
        <p>
          We do <strong>not sell</strong> your personal data, and we do not use
          it for advertising.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "Consent and your choices",
    body: (
      <p>
        You consent to this processing when you create an account. Optional data
        — health readings, progress photos, body measurements, WhatsApp number,
        gym membership details, community features — is collected only if you
        choose to add it. You can withdraw consent at any time by deleting that
        data or your account; this does not affect processing already done.
        Camera and microphone are used only while you actively use photo,
        barcode or voice logging, and the app works without them.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    body: (
      <>
        <p>
          Food search, meal photos, voice clips, your weekly statistics (for the
          weekly report) and workout preferences (for AI plans) are sent to AI
          providers — currently Google Gemini, and OpenAI GPT-OSS and other open
          models run on Groq — only to produce the result you asked for. We send
          the minimum needed and do not use your data to train models.
        </p>
        <p>
          When AI identifies a food that is not in our database, we save the
          food name and nutrition values (never your photo or voice) to a shared
          food cache, tagged with a one-way hashed key instead of your account,
          so we can answer the same search faster and limit abuse.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="p-2.5 font-semibold">Recipient</th>
                <th className="p-2.5 font-semibold">What they get</th>
                <th className="p-2.5 font-semibold">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SHARING.map(([who, what, why]) => (
                <tr key={who}>
                  <td className="p-2.5 font-medium text-foreground">{who}</td>
                  <td className="p-2.5">{what}</td>
                  <td className="p-2.5">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Partners and other users never see your food, workout, weight or
          health logs. Our service providers process data only on our
          instructions.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Where your data is stored",
    body: (
      <p>
        Our database and photos are stored in India (Supabase, Mumbai region).
        Some processing, such as AI requests and hosting, may take place outside
        India through the providers above, with safeguards in our agreements
        with them, and never in a country the Government of India has
        restricted.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>
          While your account is active, we keep your data so the app works.
        </li>
        <li>
          When you delete your account, your profile, logs, photos and health
          readings are deleted immediately. Copies in encrypted backups are
          purged within 30 days.
        </li>
        <li>
          Payment and invoice records may be kept for up to 8 years where tax
          law requires it, no longer linked to your account and with access
          restricted.
        </li>
        <li>
          Food-cache entries (food names and nutrition only) are not linked to
          you and are kept.
        </li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit (TLS) and at rest. Every table is protected
        by row-level security so each account can read only its own data,
        progress photos sit in a private bucket served by short-lived links, and
        payment state can only be changed by our server. No system is perfectly
        secure; if a breach affects you, we will tell you and the Data
        Protection Board as the law requires.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the DPDP Act you can:</p>
        <ul>
          <li>
            <strong>Access</strong> — see your data in the app or download it
            from Profile → Settings → Data export (JSON, or your food diary as
            CSV).
          </li>
          <li>
            <strong>Correct and update</strong> — edit your profile and entries
            in the app (entries from the last 7 days; email us for older ones).
          </li>
          <li>
            <strong>Erase</strong> — delete entries, or delete your account and
            all its data from Profile → Settings → Danger zone. Without the app,
            email{" "}
            <a {...emailLink(LEGAL.supportEmail)}>{LEGAL.supportEmail}</a>{" "}
            from your account email asking us to delete your account.
          </li>
          <li>
            <strong>Withdraw consent</strong> — as in section 4.
          </li>
          <li>
            <strong>Nominate</strong> someone to exercise these rights if you
            die or become unable to — email us with their details.
          </li>
          <li>
            <strong>Grievance redressal</strong> — contact our Grievance Officer
            (section 13). If you are not satisfied, you can complain to the Data
            Protection Board of India.
          </li>
        </ul>
        <p>
          We respond to requests within 30 days, and to grievances as in section
          13.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Dombelz is only for people aged 18 or older. Sign-up requires you to
        confirm you are at least 18. If we learn an account belongs to someone
        younger, we delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        For material changes we will notify you in the app or by email at least
        7 days before they take effect. The "Last updated" date shows the
        current version.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer and contact",
    body: (
      <>
        <GrievanceCard />
        <p>
          Complaints are acknowledged within 24 hours and resolved within 15
          days. For everyday questions, email{" "}
          <a {...emailLink(LEGAL.supportEmail)}>{LEGAL.supportEmail}</a> or
          visit <a href="/help">Help &amp; Support</a>.
        </p>
      </>
    ),
  },
];

function Privacy() {
  return (
    <LegalPage
      icon={ShieldCheck}
      badge="Privacy Policy"
      title="Your data. Your rules."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
