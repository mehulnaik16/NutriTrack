/**
 * Help & Support — rendered by the public /help route (Razorpay's "Contact us"
 * page) and by Profile → Help & support. Answers are plain strings so the
 * search box can match them.
 */
import { useState } from "react";
import {
  Bug,
  ChevronRight,
  CreditCard,
  Mail,
  ReceiptIndianRupee,
  Search,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { LEGAL, LEGAL_LINKS, REFUND_WINDOW_DAYS } from "@/lib/legal";
import { PLANS, REFEREE_GIFT_DAYS } from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";
import {
  DAYS_PER_REFERRAL,
  MAX_FREE_DAYS,
  MAX_PREMIUM_DAYS,
  PREMIUM_DAYS_PER_SUBSCRIPTION,
  PREMIUM_HOLD_DAYS,
} from "@/lib/referral";
import { EDIT_WINDOW_DAYS } from "@/lib/dates";
import { isNativeApp } from "@/lib/platform";

const W = REFUND_WINDOW_DAYS;
const prices = PLANS.map(
  (p) => `${p.name} ₹${p.price.toLocaleString("en-IN")}`,
).join(" · ");

type Faq = { q: string; a: string; webOnly?: boolean };

const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Account & getting started",
    items: [
      {
        q: "How do I sign up or log in?",
        a: "Use your email and a password (8+ characters) or Continue with Google. You must be 18 or older. Use the same account on the website and the mobile app — your data syncs.",
      },
      {
        q: "I forgot my password.",
        a: "On the login screen tap Forgot password and enter your email. Open the reset link we send (check spam/promotions) on the same device and set a new password. If you signed up with Google, just use Continue with Google.",
      },
      {
        q: "How are my calorie and macro targets calculated?",
        a: "We use the Mifflin-St Jeor equation for BMR, multiply by your activity level for TDEE, then adjust for your goal (for example about −500 kcal/day to lose 0.5 kg a week). Protein and fat are set per kg of body weight and carbs fill the rest. They are estimates — adjust with your doctor or dietitian if needed.",
      },
      {
        q: "Can I change my goal, weight or activity level?",
        a: "Yes. Profile → Profile details → edit. Your calorie and macro targets are recalculated instantly.",
      },
      {
        q: "How do I delete my account?",
        a: `Profile → Settings → Danger zone → Delete account & data, or email ${LEGAL.supportEmail} from your account email. It is permanent and cancels a subscription bought on our website. If you paid in the last ${W} days, request your refund first. A subscription bought through the App Store or Google Play is not cancelled by deleting your account — cancel it in the store first.`,
      },
    ],
  },
  {
    title: "Food logging",
    items: [
      {
        q: "How do I log food?",
        a: "On the Food page, search by name (our Indian food database, restaurant items and AI search), or use Photo, Voice or Barcode. You can also save meals you repeat and build your own recipes in the Meal builder. Always check the portion before saving.",
      },
      {
        q: "How do photo and voice logging work?",
        a: "Photo analyses your plate with AI; voice understands phrases like “2 rotis and a bowl of dal”. Both suggest foods and portions that you can edit before saving. Photos and voice clips are only used to identify the food and are not stored.",
      },
      {
        q: "The AI got my food or calories wrong.",
        a: "AI estimates can be off, especially for mixed dishes and portion sizes. Edit the entry, or search the food by name and pick the closest match. You can email us the dish name so we can improve the database.",
      },
      {
        q: "The barcode scan didn't find my product.",
        a: "Barcodes are looked up in Open Food Facts, which doesn't have every Indian product. Search the product by name instead, or log it from the nutrition label.",
      },
      {
        q: "Why can't I edit an old entry?",
        a: `Logs can be added or edited for today and the previous ${EDIT_WINDOW_DAYS} days. Older days are view-only so your history and streaks stay accurate.`,
      },
      {
        q: "It says I reached a calorie limit.",
        a: "Very high limits per entry and per day catch typos (like 10,000 g instead of 100 g). Check the quantity and unit of the entry you are adding.",
      },
      {
        q: "How do I rename my meals (Breakfast, Lunch…)?",
        a: "Profile → Settings → Meal categories, or the gear icon next to Log Food. You can have 2–6 meals with any names.",
      },
    ],
  },
  {
    title: "Workouts & progress",
    items: [
      {
        q: "How do I get a workout plan?",
        a: "Answer the short Workout setup (your training experience, schedule and preferences) and we create a plan. You can follow it, switch to a custom plan, or just log sessions freely. The exercise library has demo videos.",
      },
      {
        q: "Why can't I add more sets?",
        a: "Each exercise allows up to 10 sets per day while you have access (6 without) to keep logs realistic. Cardio is not capped.",
      },
      {
        q: "Where are weight, measurements and progress photos?",
        a: "Log weight and progress photos on the Weight page; body measurements are under Profile → Body measurements. Progress photos are private to you and are deleted when you delete them or your account.",
      },
      {
        q: "What does the Health Log show?",
        a: "Profile → Health Log records blood pressure and blood glucose readings and labels them against Indian reference ranges. The labels are for information only, not a diagnosis — share concerning readings with your doctor.",
      },
      {
        q: "Why isn't my streak increasing?",
        a: "A day counts when you log at least one food or workout on that day, by your local date. Log before midnight to keep it going.",
      },
      {
        q: "Who can see me on the leaderboard?",
        a: "Other users see your name or username, initials and scores like streaks and XP — never your food, weight or health data.",
      },
    ],
  },
  {
    title: "Plans, payments & refunds",
    items: [
      {
        q: "How long is the free trial?",
        a: `${BASE_TRIAL_DAYS} days of full access, once per account. No card or UPI needed and it never charges you automatically. Referring friends can add up to ${MAX_FREE_DAYS} extra days.`,
      },
      {
        q: "What do the plans cost?",
        a: `On our website: ${prices}. Every plan unlocks everything; they differ only in length. Prices include 18% GST. In the Android and iOS apps, Google Play or the App Store shows its price at checkout.`,
        // Website prices inside the native app read as steering to an outside
        // purchase (App Store 3.1.1, Play Payments policy).
        webOnly: true,
      },
      {
        q: "What stops working when my plan ends?",
        a: "The dashboard, food page and history, meal builder, progress photos, workout analytics and all AI features lock. Your data is safe. You can still log workouts and weight (without photos), and everything under Profile stays open — settings, Health Log, measurements, Refer & Earn, billing and data export.",
      },
      {
        q: "How do I buy a plan in the mobile app?",
        a: "In the Android and iOS apps, plans are sold through Google Play or the App Store, which handle billing, renewals, cancelling and refunds for those purchases. Whichever way you subscribe, your plan unlocks the same account on every device.",
      },
      {
        q: "Does my plan renew automatically?",
        a: "Yes. Website plans renew at the end of each period through the UPI Autopay or card mandate you approved; your bank or UPI app notifies you before each debit. App Store and Google Play plans renew through the store. Cancel any time to stop renewals.",
      },
      {
        q: "How do I cancel?",
        a: "Website plans: Profile → Plan & billing → Cancel subscription. Renewals stop immediately and you keep access until your paid period ends. App Store or Google Play plans: cancel in your store's subscription settings. Uninstalling the app does not cancel.",
      },
      {
        q: "How do I get a refund?",
        a: `For a website payment, within ${W} days: Profile → Plan & billing → Payment history → Request refund. You get the full amount back to your original payment method — usually 1–3 business days for UPI, 5–7 for cards. After ${W} days only billing errors are refunded. App Store and Google Play purchases are refunded by the store under its own policy.`,
      },
      {
        q: "I paid but my account still shows locked.",
        a: "Close and reopen the app — access normally updates within a minute. If it hasn't after 24 hours, email us your payment ID or UPI reference (UTR) and the account email you used.",
      },
      {
        q: "Money was debited but the payment failed.",
        a: "Your bank or Razorpay reverses failed payments automatically, usually within 5–7 business days. If it hasn't come back by then, email us the UTR from your bank statement.",
      },
      {
        q: "I was charged twice / after cancelling.",
        a: "That's a billing error and is always refunded in full. Email us the payment IDs within 30 days and we'll fix it.",
      },
      {
        q: "Can I switch plans?",
        a: "Yes — buy the new plan from Pricing. Your old subscription stops so you're never billed twice, the days you already paid for are kept, and the new plan's days are added after them.",
      },
    ],
  },
  {
    title: "Refer & Earn and partner codes",
    items: [
      {
        q: "How does Refer & Earn work?",
        a: `Share your code from Profile → Refer & Earn. You get +${DAYS_PER_REFERRAL} trial days for each friend who signs up and starts their trial (up to ${MAX_FREE_DAYS} days), and ${PREMIUM_DAYS_PER_SUBSCRIPTION} premium days when a friend buys the Yearly plan (up to ${MAX_PREMIUM_DAYS} days in total). Premium days are credited ${PREMIUM_HOLD_DAYS} days after their payment.`,
      },
      {
        q: "What does my friend get?",
        a: `${REFEREE_GIFT_DAYS} extra days on their first Yearly purchase, credited ${PREMIUM_HOLD_DAYS} days after payment. They pay the normal price.`,
      },
      {
        q: "I forgot to enter a referral or gym code.",
        a: "Codes can only be entered during signup, and an account can use one code — a friend's or a partner's. You can still link your gym later in Profile → Your Gym, but that doesn't earn the signup gift.",
      },
      {
        q: "What can my gym, clinic or creator see?",
        a: "If you joined with their code or linked your gym, they see your name, your plan and its expiry date, and payments made through their code. They never see your food, workout, weight or health logs.",
      },
    ],
  },
  {
    title: "Reminders & notifications",
    items: [
      {
        q: "How do I set reminders?",
        a: "In the mobile app, Profile → Notifications. Add reminders for meals, water or workouts at the times you choose, turn on morning motivation, and set snooze and quiet hours.",
      },
      {
        q: "My reminders aren't arriving.",
        a: "Allow notifications for Dombelz in your phone settings, and on Android turn off battery optimisation for the app (Settings → Apps → Dombelz → Battery → Unrestricted). Reminders inside your quiet hours are skipped. Open the app once after a phone restart so reminders are rescheduled.",
      },
    ],
  },
  {
    title: "Privacy & your data",
    items: [
      {
        q: "How do I download my data?",
        a: "Profile → Settings → Data export: all your logs as JSON, or your food diary as CSV.",
      },
      {
        q: "Is my data sold or used for ads?",
        a: "No. We don't sell your data or show third-party ads. Read the Privacy Policy for exactly what we collect and why.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        q: "It says “AI is busy”.",
        a: "Our AI providers are under heavy load. Wait a minute and try again, or search the food by name — the database works without AI.",
      },
      {
        q: "The app isn't loading or looks out of date.",
        a: "Check your connection, then fully close and reopen the app. On the website, refresh the page. On Android, make sure the app is updated from the Play Store. Still stuck? Report a bug below.",
      },
    ],
  },
];

const BUG_BODY = [
  "What happened:",
  "What you expected:",
  "Steps to reproduce:",
  "Device / browser:",
  "App version:",
  "Account email:",
].join("\n\n");

const mailto = (subject: string, body?: string) =>
  `mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;

const QUICK = [
  {
    href: mailto("Dombelz support request"),
    icon: Mail,
    title: "Email support",
    sub: LEGAL.supportEmail,
  },
  {
    href: mailto("Dombelz bug report", BUG_BODY),
    icon: Bug,
    title: "Report a bug",
    sub: "Opens a ready-made email",
  },
  {
    href: "/profile?page=transactions",
    icon: CreditCard,
    title: "Plan & billing",
    sub: "Cancel, refunds, payment history",
  },
  {
    href: "/refund",
    icon: ReceiptIndianRupee,
    title: "Refund policy",
    sub: `Full refund within ${W} days`,
  },
];

const CARD = "rounded-2xl border border-border bg-card";
const LABEL =
  "mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const native = isNativeApp();

  const groups = FAQ_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (f) =>
        !(native && f.webOnly) &&
        (!q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help — e.g. refund, streak, barcode"
          aria-label="Search help"
          className="h-12 rounded-xl pl-10"
        />
      </div>

      {!q && (
        <section>
          <p className={LABEL}>Quick help</p>
          <div className="grid grid-cols-2 gap-3">
            {QUICK.map(({ href, icon: Icon, title, sub }) => (
              <a
                key={title}
                href={href}
                className={`${CARD} flex flex-col gap-1.5 p-4 transition-colors hover:bg-muted/40`}
              >
                <Icon className="h-5 w-5 text-accent" />
                <span className="text-sm font-semibold">{title}</span>
                <span className="break-words text-xs text-muted-foreground">
                  {sub}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <p className={`${CARD} p-5 text-sm text-muted-foreground`}>
          No answers match “{query.trim()}”. Email us at{" "}
          <a href={mailto("Dombelz support request")} className="text-accent">
            {LEGAL.supportEmail}
          </a>{" "}
          and we'll help.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.title}>
            <p className={LABEL}>{g.title}</p>
            <div className={`${CARD} px-4`}>
              <Accordion type="single" collapsible className="w-full">
                {g.items.map((f, i) => (
                  <AccordionItem
                    key={f.q}
                    value={f.q}
                    className={i === g.items.length - 1 ? "border-b-0" : ""}
                  >
                    <AccordionTrigger className="text-left text-sm font-semibold">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>
        ))
      )}

      <section>
        <p className={LABEL}>Contact us</p>
        <div className={`${CARD} divide-y divide-border text-sm`}>
          <div className="p-4">
            <a
              href={mailto("Dombelz support request")}
              className="font-semibold text-accent"
            >
              {LEGAL.supportEmail}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              Replies within 1–2 business days. Billing issues within 1 business
              day. Write from your account email.
            </p>
          </div>
          {LEGAL.supportPhone && (
            <div className="p-4">
              <a
                href={`tel:${LEGAL.supportPhone.replace(/\s/g, "")}`}
                className="font-semibold text-accent"
              >
                {LEGAL.supportPhone}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {LEGAL.supportHours}
              </p>
            </div>
          )}
          <div className="p-4">
            <p className="font-semibold">
              Grievance Officer: {LEGAL.grievanceOfficer}
            </p>
            <a href={`mailto:${LEGAL.grievanceEmail}`} className="text-accent">
              {LEGAL.grievanceEmail}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              For complaints not resolved by support, and privacy or data
              requests. Acknowledged within 24 hours, resolved within 15 days.
            </p>
          </div>
          <p className="p-4 text-xs text-muted-foreground">
            {LEGAL.legalName} · {LEGAL.address}
            {LEGAL.gstin && ` · GSTIN ${LEGAL.gstin}`}
          </p>
        </div>
      </section>

      <section>
        <p className={LABEL}>Legal</p>
        <div className={`${CARD} divide-y divide-border overflow-hidden`}>
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="text-sm font-medium">{l.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
