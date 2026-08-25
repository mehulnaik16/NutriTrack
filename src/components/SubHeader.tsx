import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky back-arrow header for the profile sub-pages.
 *
 * Lives here rather than in routes/profile.tsx so that sub-pages extracted into
 * their own components (Refer & Earn, Achievements) can use it without importing
 * the route module back — that would be a circular import.
 */
export function SubHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
