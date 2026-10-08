import { BrandLogo } from "@/components/BrandLogo";

/** Page and section loading indicator: the brand mark, pulsing. */
export function LogoLoader({ className = "h-10 w-10 text-accent" }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex">
      <BrandLogo className={`${className} animate-pulse`} />
    </span>
  );
}
