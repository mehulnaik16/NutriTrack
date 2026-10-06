import { createFileRoute } from "@tanstack/react-router";
import { ReceiptIndianRupee } from "lucide-react";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { emailLink, LEGAL, REFUND_WINDOW_DAYS } from "@/lib/legal";
import { PLANS, REFEREE_GIFT_DAYS, periodLabel } from "@/lib/plans";
import { BASE_TRIAL_DAYS } from "@/lib/trial";
import { PREMIUM_HOLD_DAYS } from "@/lib/referral";

export const Route = createFileRoute("/refund")({ component: Refund });

const W = REFUND_WINDOW_DAYS;

const SUMMARY = [
  "The free trial costs nothing and never auto-charges.",
  "Paid plans renew automatically. Cancel any time and keep access until your paid period ends.",
  `Website payments: full refund if you ask within ${W} days. After that, only billing errors are refunded.`,
  "Refunds go back to your original payment method — usually 1–3 business days for UPI, 5–7 for cards.",
  "Bought in the Android or iOS app? Google Play or the App Store handles cancellation and refunds.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "scope",
    title: "What this policy covers",
    body: (
      <>
        <p>
          This policy covers Dombelz subscriptions bought on {LEGAL.website} and
          paid through Razorpay. It forms part of our{" "}
          <a href="/terms">Terms of Service</a>.
        </p>
        <p>
          <strong>Bought inside the Android or iOS app?</strong> Those
          subscriptions are sold and billed by Google Play or the App Store. The
          store's own cancellation and refund policy applies, and you request
          refunds from the store: on Android through Google Play (Play Store →
          Payments &amp; subscriptions, or play.google.com), on iPhone through
          reportaproblem.apple.com. We cannot refund store purchases ourselves,
          but email us if you need help. Sections 2–15 below apply to website
          purchases.
        </p>
      </>
    ),
  },
  {
    id: "trial",
    title: "Free trial",
    body: (
      <p>
        The {BASE_TRIAL_DAYS}-day trial is free and needs no card or UPI, so
        there is nothing to charge or refund. It does <strong>not</strong> turn
        into a paid plan on its own — you are only charged if you choose a plan.
      </p>
    ),
  },
  {
    id: "billing",
    title: "How billing works",
    body: (
      <>
        <ul>
          {PLANS.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — ₹{p.price.toLocaleString("en-IN")}
              {periodLabel(p.months)}, gives {p.days} days of access per payment
            </li>
          ))}
        </ul>
        <p>
          Prices include 18% GST. You pay the full amount for the period up
          front. Plans <strong>renew automatically</strong> at the end of each
          period through the UPI Autopay or card mandate you approved, until you
          cancel. Your bank or UPI app notifies you before each automatic debit.
        </p>
      </>
    ),
  },
  {
    id: "cancel",
    title: "Cancelling your subscription",
    body: (
      <ul>
        <li>
          Go to{" "}
          <strong>Profile → Plan &amp; billing → Cancel subscription</strong>.
        </li>
        <li>
          Cancelling stops all future renewals immediately. You keep full access
          until the end of the period you have already paid for — nothing is cut
          short.
        </li>
        <li>
          Cancelling is not a refund. To get money back for a recent payment,
          request a refund (section 5).
        </li>
        <li>
          Uninstalling the app or logging out does <strong>not</strong> cancel
          your subscription. Revoking the mandate in your UPI or bank app stops
          charges too, but please also cancel in the app so your account shows
          the right status.
        </li>
        <li>
          Deleting your account cancels your website subscription automatically
          (see section 11).
        </li>
        <li>
          App Store or Google Play subscriptions are cancelled in your store's
          subscription settings (iPhone Settings → your name → Subscriptions;
          Play Store → Payments &amp; subscriptions).
        </li>
      </ul>
    ),
  },
  {
    id: "window",
    title: `${W}-day refund window`,
    body: (
      <>
        <p>
          You can get a <strong>full refund</strong> (including GST) of any
          website payment — your first purchase or any renewal — if you ask
          within{" "}
          <strong>
            {W} days ({W * 24} hours)
          </strong>{" "}
          of being charged. No questions asked, though a reason helps us
          improve.
        </p>
        <p>How to request one:</p>
        <ul>
          <li>
            In the app:{" "}
            <strong>Profile → Plan &amp; billing → Payment history</strong>, tap{" "}
            <strong>Request refund</strong> next to the payment and add a
            reason.
          </li>
          <li>
            Or email{" "}
            <a {...emailLink(LEGAL.supportEmail)}>{LEGAL.supportEmail}</a>{" "}
            from your account email with the payment date, amount and Razorpay
            payment ID (in your payment receipt email).
          </li>
        </ul>
        <p>
          A request counts as on time if it reaches us within the window, even
          if we process it later. Only one open request per payment is allowed.
        </p>
      </>
    ),
  },
  {
    id: "timing",
    title: "How long a refund takes",
    body: (
      <ul>
        <li>We review and approve requests within 2 business days.</li>
        <li>
          Approved refunds go back to the original payment method via Razorpay.
          UPI refunds usually arrive within 1–3 business days; cards and net
          banking take 5–7 business days, depending on your bank.
        </li>
        <li>
          You get an email when the refund is issued. If it has not reached you
          after 7 business days, write to us and we will share the refund
          reference (ARN/UTR) to show your bank.
        </li>
      </ul>
    ),
  },
  {
    id: "access",
    title: "What happens to your access after a refund",
    body: (
      <ul>
        <li>
          The days that payment bought are removed as soon as the refund is
          processed. If you have no other paid, trial or bonus days left, paid
          features lock again; your data stays.
        </li>
        <li>
          When we approve a refund we also cancel the subscription it belongs
          to, so it will not renew.
        </li>
        <li>
          The {REFEREE_GIFT_DAYS}-day friend/partner gift on a first Yearly
          purchase is credited {PREMIUM_HOLD_DAYS} days after payment. If you
          request a refund before then, the gift is not credited; if the payment
          is refunded later, unused gift days are withdrawn.
        </li>
        <li>
          If you were referred, your friend's reward for your purchase is
          handled the same way (see{" "}
          <a href="/refer-terms">Refer &amp; Earn Terms</a>).
        </li>
      </ul>
    ),
  },
  {
    id: "not-refundable",
    title: "When refunds are not available",
    body: (
      <ul>
        <li>
          Requests made after the {W}-day ({W * 24}-hour) window.
        </li>
        <li>
          Partial or pro-rata refunds for the unused part of a period, other
          than in the cases in section 9 or where our Terms promise one.
        </li>
        <li>
          Trial, referral, bonus, gift or premium days — they have no cash
          value.
        </li>
        <li>Accounts closed for fraud, abuse or breach of our Terms.</li>
      </ul>
    ),
  },
  {
    id: "billing-errors",
    title: "Billing errors are always refunded",
    body: (
      <>
        <p>
          Whatever the date, we refund in full if you were charged by mistake.
          This includes:
        </p>
        <ul>
          <li>a duplicate charge for the same period;</li>
          <li>a renewal taken after you had cancelled;</li>
          <li>any charge taken after you deleted your account;</li>
          <li>a charge for the wrong amount;</li>
          <li>
            a successful payment where access was not activated and we could not
            fix it within 3 business days of you telling us.
          </li>
        </ul>
        <p>
          Please report billing errors within 30 days of the charge with your
          payment ID so we can trace it quickly.
        </p>
      </>
    ),
  },
  {
    id: "switching",
    title: "Switching plans",
    body: (
      <p>
        When you buy a different plan, your old subscription stops at once so
        you are never billed twice. You keep every day you have already paid
        for, and the new plan's days are added after them. Because no paid days
        are lost, the old plan is not refunded. The new payment has its own {W}
        -day refund window.
      </p>
    ),
  },
  {
    id: "deleting",
    title: "Deleting your account",
    body: (
      <p>
        Deleting your account cancels your website subscription so you are not
        charged again. Remaining paid days are forfeited and not refunded,
        except for a payment that is still inside the {W}-day window.{" "}
        <strong>Request any refund before deleting</strong> — after deletion
        your payment history is no longer visible in the app, so you would need
        to email us with your payment ID.{" "}
        <strong>
          Deleting your account does not cancel an App Store or Google Play
          subscription
        </strong>{" "}
        — cancel it in the store first, or it will keep renewing.
      </p>
    ),
  },
  {
    id: "failed",
    title: "Failed or pending payments",
    body: (
      <p>
        If money left your account but the payment failed or stayed pending,
        Razorpay and your bank reverse it automatically, usually within 5–7
        business days, and you are not charged. If access did not activate after
        a successful payment, reopen the app first — it normally updates within
        a minute. If it still has not after 24 hours, email us with the payment
        ID or UPI reference (UTR).
      </p>
    ),
  },
  {
    id: "delivery",
    title: "Delivery of the service (shipping)",
    body: (
      <p>
        Dombelz is a digital service; nothing physical is shipped. Access is
        activated on your account as soon as payment succeeds — normally within
        a minute, and in rare delays within 24 hours. Razorpay emails you a
        payment receipt, and your plan and expiry date are shown under Profile →
        Plan &amp; billing.
      </p>
    ),
  },
  {
    id: "taxes",
    title: "Taxes and invoices",
    body: (
      <p>
        All prices include 18% GST. A refund returns the full amount you paid,
        GST included.{" "}
        {LEGAL.gstin
          ? `Our GSTIN is ${LEGAL.gstin}. Email us for a GST invoice, quoting your payment ID and GSTIN if you want to claim input credit.`
          : "Email us if you need an invoice for your payment."}
      </p>
    ),
  },
  {
    id: "changes",
    title: "Price and policy changes",
    body: (
      <p>
        If we change a price, it applies only from your next renewal and we tell
        you at least 7 days in advance. Changes to this policy never apply to
        payments made before the change.
      </p>
    ),
  },
];

function Refund() {
  return (
    <LegalPage
      icon={ReceiptIndianRupee}
      badge="Refund & Cancellation"
      title="Fair, fast refunds."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
