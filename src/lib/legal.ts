/**
 * Business details every legal and support page reads. Change them here only —
 * Razorpay compares the name and address with KYC, so they must match exactly.
 */
export const LEGAL = {
  brand: "Dombelz",
  legalName: "DOMBELZ", // must match PAN / GST / Razorpay KYC exactly
  address: "Bengaluru, Karnataka, India", // TODO: full street address + PIN before Razorpay review
  website: "www.dombelz.com",
  supportEmail: "support@dombelz.com",
  supportPhone: "+91 82778 06800", // "" hides the phone row
  supportHours: "Mon–Sat, 10:00–18:00 IST",
  grievanceOfficer: "Dr Gagan",
  grievanceEmail: "grievance@dombelz.com",
  gstin: "", // set once GST-registered; GSTIN lines appear automatically
  jurisdiction: "Bengaluru, Karnataka",
} as const;

export const LEGAL_UPDATED = "October 2, 2026";

/** Must equal the interval '2 day' in public.request_refund(). */
export const REFUND_WINDOW_DAYS = 2;

/** Footer of every legal page and the Legal list in Help. */
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund & Cancellation" },
  { href: "/refund#delivery", label: "Shipping & Delivery" },
  { href: "/refer-terms", label: "Refer & Earn Terms" },
];
