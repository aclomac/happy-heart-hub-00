import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/erp/PageHeader";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/utilities/close-financial-year")({
  component: CloseFinancialYear,
});

const REQUIRED_TEXT = "CLOSE YEAR";

function CloseFinancialYear() {
  const [confirmText, setConfirmText] = useState("");

  return (
    <div>
      <PageHeader
        title="Close Financial Year"
        subtitle="Archive the current year and reset running numbers"
        actions={
          <Link to="/app/utilities">
            <Button variant="outline" size="sm">
              Back
            </Button>
          </Link>
        }
      />

      <div className="bg-card border rounded-md p-6 max-w-2xl space-y-4">
        <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-destructive">This action is destructive.</div>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
              <li>Closes all open documents for the current financial year.</li>
              <li>Resets invoice / bill / payment running numbers.</li>
              <li>Carries forward party balances and stock as opening balances.</li>
              <li>Cannot be undone once posted.</li>
            </ul>
          </div>
        </div>

        <div className="p-3 rounded-md bg-muted/40 border text-sm">
          <strong>Not enabled yet.</strong> Close Financial Year requires bookkeeping setup that
          isn't available in this build. Please contact support to safely close a financial year.
          The form below is shown for preview only and will not post anything.
        </div>

        <div className="space-y-2">
          <Label htmlFor="cfy-confirm">
            Type <code className="bg-muted px-1 rounded">{REQUIRED_TEXT}</code> to confirm
          </Label>
          <Input
            id="cfy-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={REQUIRED_TEXT}
            maxLength={50}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Link to="/app/utilities">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button
            variant="destructive"
            disabled
            title="Close Financial Year will be available after accounting verification."
          >
            Close Year (disabled)
          </Button>
        </div>
      </div>
    </div>
  );
}
