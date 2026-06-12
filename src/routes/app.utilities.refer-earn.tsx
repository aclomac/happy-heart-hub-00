import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/PageHeader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Gift } from "lucide-react";

export const Route = createFileRoute("/app/utilities/refer-earn")({ component: ReferEarn });

function ReferEarn() {
  return (
    <div>
      <PageHeader
        title="Refer & Earn"
        subtitle="Invite friends and earn rewards"
        actions={
          <Link to="/app/utilities">
            <Button variant="outline" size="sm">Back</Button>
          </Link>
        }
      />
      <div className="bg-card border rounded-md p-8 max-w-2xl space-y-4 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Gift className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-semibold">Refer & Earn is a SaaS-only feature</h2>
        <p className="text-sm text-muted-foreground">
          You're using ERPOVO in personal/local mode. Refer & Earn rewards are issued by the live
          SaaS billing system and are not available offline.
        </p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button disabled>Generate referral code</Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Available only in live SaaS mode.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
