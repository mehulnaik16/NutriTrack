import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { LegalPage } from "@/components/LegalPage";
import { HelpCenter } from "@/components/HelpCenter";

export const Route = createFileRoute("/help")({ component: Help });

function Help() {
  return (
    <LegalPage icon={LifeBuoy} badge="Help & Support" title="How can we help?">
      <HelpCenter />
    </LegalPage>
  );
}
