import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import {
  GrievanceCard,
  LegalPage,
  type LegalSection,
} from "@/components/LegalPage";
import { LEGAL, REFUND_WINDOW_DAYS } from "@/lib/legal";
import { PLANS, REFEREE_GIFT_DAYS, periodLabel } from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";
import { MAX_FREE_DAYS } from "@/lib/referral";

export const Route = createFileRoute("/terms")({ component: Terms });

const refundWindow = `${REFUND_WINDOW_DAYS} days (${REFUND_WINDOW_DAYS * 24} hours)`;

const SUMMARY = [
  "Dombelz is a wellness tracker, not medical advice. Check with a doctor before big diet or exercise changes.",
  "AI estimates can be wrong — review every entry before saving.",
  `${BASE_TRIAL_DAYS}-day free trial, no payment needed. Paid plans renew automatically until you cancel.`,
  `Full refund on any website payment if you ask within ${REFUND_WINDOW_DAYS} days. App Store and Google Play purchases follow the store's refund rules.`,
  "Your data is yours: export or delete it any time.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Who we are and this agreement",
    body: (
      <>
        <p>
          Dombelz (the "app", "service", "we", "us") is a nutrition and fitness
          tracking service operated by <strong>{LEGAL.legalName}</strong>,{" "}
          {LEGAL.address}. It is available at {LEGAL.website}, as an installable
          web app, and as an Android/iOS app.
        </p>
        <p>
          These Terms, together with our <a href="/privacy">Privacy Policy</a>,{" "}
          <a href="/refund">Refund &amp; Cancellation Policy</a> and{" "}
          <a href="/refer-terms">Refer &amp; Earn Terms</a>, form a binding
          agreement between you and us. By creating an account or using the
          service you accept them. If you do not agree, do not use Dombelz.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Dombelz",
    body: (
      <ul>
        <li>
          You must be <strong>at least 18 years old</strong>. We do not
          knowingly create accounts for anyone younger, and we delete any we
          find.
        </li>
        <li>The service is offered for use in India.</li>
        <li>
          One person, one account. Accounts are personal and may not be shared,
          sold or transferred.
        </li>
      </ul>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>
          You can sign up with an email and password or with Google. Keep your
          login secure — you are responsible for activity under your account.
          Tell us immediately at {LEGAL.supportEmail} if you suspect
          unauthorised use.
        </li>
        <li>
          Give accurate details (age, height, weight, activity, goal). Your
          calorie and macro targets are calculated from them and are only as
          good as what you enter.
        </li>
        <li>
          You can delete your account at any time from Profile → Settings →
          Danger zone, or by emailing {LEGAL.supportEmail} from your account
          email. Deletion is permanent, and it cancels any subscription you
          bought on our website so you are not charged again (see section 9).{" "}
          <strong>
            A subscription bought through the App Store or Google Play is billed
            by that store and is not cancelled by deleting your account
          </strong>{" "}
          — cancel it in your store's subscription settings.
        </li>
      </ul>
    ),
  },
  {
    id: "service",
    title: "What the service includes",
    body: (
      <>
        <p>Depending on your plan, Dombelz lets you:</p>
        <ul>
          <li>
            Log food by search (our Indian food database, branded restaurant
            items and AI search), meal photo, voice, barcode scan, saved meals
            and the meal builder.
          </li>
          <li>
            Get daily calorie, macro, fibre and water targets and an AI weekly
            report.
          </li>
          <li>
            Follow workout plans, log gym and cardio sessions, browse the
            exercise library and see progress graphs.
          </li>
          <li>
            Track weight, progress photos, body measurements and blood pressure
            / blood glucose readings.
          </li>
          <li>
            Earn streaks, achievements and XP, join the leaderboard, add friends
            and send cheers.
          </li>
          <li>
            Set reminders (mobile app), refer friends, and link a gym, clinic or
            creator partner code.
          </li>
        </ul>
        <p>
          We improve the service continuously, so features may be added, changed
          or retired. If we remove a core paid feature, we will tell you in
          advance and you may request a pro-rata refund of your unused paid
          days.
        </p>
      </>
    ),
  },
  {
    id: "medical",
    title: "Not medical advice",
    body: (
      <>
        <p>
          Dombelz gives <strong>general wellness information only</strong>. It
          is not a medical device and does not diagnose, treat, cure or prevent
          any condition. Calorie targets, nutrition values, workout suggestions,
          AI estimates and weekly reports may be inaccurate or unsuitable for
          you.
        </p>
        <p>
          The Health Log lets you record blood pressure and blood glucose
          readings and labels them using published Indian reference ranges (InSH
          2023 and standard plasma glucose bands). These labels are for your own
          reference — they are <strong>not a diagnosis</strong>. Discuss any
          reading that concerns you with a doctor, and seek emergency care for
          severe symptoms.
        </p>
        <p>
          Consult a qualified doctor or dietitian before starting or changing
          any diet or exercise programme, especially if you are pregnant or
          breastfeeding, have diabetes, a heart, kidney or blood-pressure
          condition, have had an eating disorder, are on medication, or are
          recovering from injury. Stop exercising and get medical help if you
          feel pain, dizziness, chest discomfort or shortness of breath. You
          exercise and change your diet at your own risk.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <ul>
        <li>
          Photo, voice and AI text search, the weekly report and AI workout
          plans are generated by third-party AI models (currently Google Gemini,
          and OpenAI GPT-OSS and other open models run on Groq). AI output can
          be wrong — always review the food, portion and nutrition values before
          you save an entry.
        </li>
        <li>
          Only upload photos of food and speak only food descriptions. Do not
          upload images of people, documents or anything you do not have the
          right to share.
        </li>
        <li>
          When AI identifies a food that is not in our database, we may keep the
          food name and nutrition values (never your photo or voice) in a shared
          food cache to answer future searches faster. This cache is not linked
          to your name or email.
        </li>
        <li>
          AI features have fair-use limits and may be briefly unavailable when
          our providers are busy. They are only available while you have active
          access (trial, paid or bonus days).
        </li>
      </ul>
    ),
  },
  {
    id: "trial",
    title: "Free trial",
    body: (
      <ul>
        <li>
          New accounts get a <strong>{BASE_TRIAL_DAYS}-day free trial</strong>{" "}
          with full access. No card or UPI is needed and it does{" "}
          <strong>not</strong> convert into a paid plan automatically.
        </li>
        <li>
          One trial per account, ever. Referral rewards can extend it by up to{" "}
          {MAX_FREE_DAYS} extra days (see the Refer &amp; Earn Terms).
        </li>
        <li>
          When your trial or paid period ends, the dashboard, food page and
          history, meal builder, progress photos, workout analytics and all AI
          features lock until you buy a plan. Your data is kept. You can still
          log workouts (with a lower daily set limit) and weight (without
          progress photos), and everything under Profile stays open — settings,
          Health Log, body measurements, Refer &amp; Earn, Plan &amp; billing,
          data export and account deletion.
        </li>
      </ul>
    ),
  },
  {
    id: "plans",
    title: "Plans, prices and auto-renewal",
    body: (
      <>
        <p>Every plan unlocks the whole app; plans differ only in length:</p>
        <ul>
          {PLANS.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — ₹{p.price.toLocaleString("en-IN")}
              {periodLabel(p.months)}
            </li>
          ))}
        </ul>
        <p>
          These are our website prices, in Indian Rupees and inclusive of all
          taxes (18% GST included). The full amount for the period is charged up
          front.
        </p>
        <p>
          <strong>Where you can buy.</strong> On our website, payments are
          processed by Razorpay; we never see or store your full card, UPI PIN
          or bank details. Inside the Android or iOS app, subscriptions are sold
          only through Google Play or the App Store and are billed, renewed,
          cancelled and refunded by that store under its own terms. The price
          shown in the store at checkout applies to store purchases.
        </p>
        <p>
          <strong>Plans renew automatically.</strong> When you subscribe on our
          website you authorise a recurring payment (e-mandate on UPI Autopay or
          a supported card). At the end of each period the same plan is charged
          again at the then-current price until you cancel. As required by the
          Reserve Bank of India, your bank or UPI app notifies you before each
          automatic debit. If a renewal fails, Razorpay may retry; your access
          ends when your paid days run out and resumes once a payment succeeds.
          Store subscriptions renew under the store's rules until you cancel
          them in the store.
        </p>
        <p>
          We may change prices. A new price applies only from your next renewal,
          and we will tell you at least 7 days before it does — you can cancel
          before then.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation, plan changes and refunds",
    body: (
      <>
        <ul>
          <li>
            Website plans: cancel any time from Profile → Plan &amp; billing.
            Renewals stop immediately and you keep access until the end of the
            period you already paid for.
          </li>
          <li>
            You can request a full refund of any website payment within{" "}
            <strong>{refundWindow}</strong> of the charge. After that, payments
            are non-refundable except for billing errors.
          </li>
          <li>
            Switching plans stops the old subscription at once; days you have
            already paid for are kept and the new plan's days are added after
            them.
          </li>
          <li>
            App Store and Google Play subscriptions are cancelled in your
            store's subscription settings, and refunds are requested from the
            store.
          </li>
        </ul>
        <p>
          Full details are in our{" "}
          <a href="/refund">Refund &amp; Cancellation Policy</a>.
        </p>
      </>
    ),
  },
  {
    id: "referrals",
    title: "Referrals, partner codes and bonus days",
    body: (
      <ul>
        <li>
          Refer &amp; Earn rewards are governed by the{" "}
          <a href="/refer-terms">Refer &amp; Earn Terms</a>.
        </li>
        <li>
          A gym, clinic or creator partner code can only be entered while
          signing up, and an account can be attributed to one friend or one
          partner, never both. A code used at signup earns {REFEREE_GIFT_DAYS}{" "}
          bonus days on your first Yearly purchase.
        </li>
        <li>
          If you join through a partner code or link a gym from your profile,
          that partner can see your name, your plan and its expiry date,
          payments attributed to them (they earn a commission on these) and, if
          you add gym membership details, the phone number and dates you enter.
          They cannot see your food, workout, weight or health logs.
        </li>
        <li>
          Trial, bonus, gift and premium days have no cash value, cannot be
          transferred or exchanged, and are withdrawn if obtained through fraud
          or if the payment that earned them is refunded.
        </li>
      </ul>
    ),
  },
  {
    id: "community",
    title: "Leaderboard, friends and cheers",
    body: (
      <p>
        If you take part in community features, other users can see your name or
        username, profile initials and aggregate scores (streaks, XP,
        achievements) — never your food, weight or health logs. Choose a
        username that is not offensive, misleading or someone else's identity.
        We may rename or remove anything that breaks these Terms.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>access or try to access another user's account or data;</li>
          <li>
            scrape, copy or resell our food database, exercise library or AI
            output, or use bots or automated scripts;
          </li>
          <li>
            reverse engineer, overload or interfere with the app, its security
            or its AI limits;
          </li>
          <li>
            create multiple or fake accounts, refer yourself, or otherwise game
            trials, referrals, partner codes or the leaderboard;
          </li>
          <li>
            upload unlawful, obscene, hateful or infringing content, or content
            showing other people without consent;
          </li>
          <li>use the service in violation of any Indian law.</li>
        </ul>
        <p>
          To keep the service reliable we apply fair-use limits, for example a
          maximum calories per single food entry and per day, a daily cap on
          sets per exercise, and AI request rate limits. Logs can be edited for
          today and the previous 7 days; older entries are view-only.
        </p>
      </>
    ),
  },
  {
    id: "your-data",
    title: "Your data and content",
    body: (
      <p>
        You own the logs, photos and other content you add. You give us a
        limited, non-exclusive licence to store, process and display it only to
        run and improve the service for you, as described in the Privacy Policy.
        We may use anonymised, aggregated statistics that do not identify you.
        You can export your data from Profile → Settings → Data export and
        delete it by deleting your account. If you send us feedback, we may use
        it without obligation to you.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: (
      <p>
        The app, its design, code, brand, our compiled food database, workout
        plans and written content belong to us or our licensors and are
        protected by law. Nutrition data includes values derived from the Indian
        Food Composition Tables (IFCT 2017, ICMR-NIN) and Open Food Facts (Open
        Database Licence). Exercise videos are third-party YouTube content owned
        by their creators. Nothing in these Terms transfers ownership to you;
        you get a personal, non-transferable, revocable licence to use the app.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        We rely on trusted providers including Supabase (database and login),
        Vercel (hosting), Razorpay (website payments), Google Play and the App
        Store (in-app purchases), Google (sign-in and Gemini AI), Groq (GPT-OSS
        and other open AI models), Open Food Facts (barcode lookups) and YouTube
        (exercise videos). Their own terms apply to your use of them, and we are
        not responsible for outages or content outside our control.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <>
        <p>
          You may stop using the service and delete your account at any time.
        </p>
        <p>
          We may suspend or close an account, or withdraw rewards, if you breach
          these Terms, commit fraud or abuse, or if the law requires it. Where
          possible we will warn you first and tell you why. If we close your
          account without you being at fault, we will refund your unused paid
          days pro-rata. Accounts closed for fraud or abuse are not refunded.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        The service is provided "as is" and "as available". To the extent the
        law allows, we make no promise that it will be uninterrupted,
        error-free, or that any nutrition value, AI estimate or result is
        accurate or will help you reach a particular goal.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the extent the law allows, we are not liable for indirect, incidental
        or consequential losses, for injury from exercise or diet changes you
        choose to make, or for decisions based on estimates shown in the app.
        Our total liability for any claim is limited to the amount you paid us
        in the 12 months before the claim. Nothing here limits liability that
        cannot be limited under Indian law, or your rights under the Consumer
        Protection Act, 2019.
      </p>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to compensate us for losses and legal costs caused by your
        breach of these Terms, misuse of the service, or content you upload.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of India. Please contact our
        Grievance Officer first — most issues are solved quickly that way.
        Subject to your rights to approach a Consumer Commission, the courts at{" "}
        {LEGAL.jurisdiction} have exclusive jurisdiction.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms. For material changes we will notify you in
        the app or by email at least 7 days before they take effect. If you keep
        using the service after that, the new Terms apply; if you do not agree,
        you can cancel and delete your account.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer and contact",
    body: (
      <>
        <p>
          In line with the Information Technology Act, 2000, the Consumer
          Protection (E-Commerce) Rules, 2020 and the Digital Personal Data
          Protection Act, 2023:
        </p>
        <GrievanceCard />
        <p>
          We acknowledge complaints within 24 hours and aim to resolve them
          within 15 days. For everyday help, use{" "}
          <a href="/help">Help &amp; Support</a>.
        </p>
      </>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These Terms and the policies they link to are the entire agreement
        between us. If any part is unenforceable, the rest still applies. Not
        enforcing a right is not a waiver of it. You may not transfer your
        rights under these Terms; we may transfer ours to a successor business,
        with notice to you.
      </p>
    ),
  },
];

function Terms() {
  return (
    <LegalPage
      icon={ScrollText}
      badge="Terms of Service"
      title="The ground rules."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
