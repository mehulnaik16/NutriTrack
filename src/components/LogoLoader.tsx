import { BrandLogo } from "@/components/BrandLogo";

/**
 * Page and section loading indicator: the brand mark's tiles fill one by one
 * in the launch video's order, then repeat, for as long as it is mounted.
 * Animation lives in styles.css (.logo-loader).
 */
export function LogoLoader({ className = "h-10 w-10 text-accent" }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex">
      <BrandLogo className={`logo-loader ${className}`} />
    </span>
  );
}
