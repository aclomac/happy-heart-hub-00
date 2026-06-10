import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoCompanySelected() {
  return (
    <div className="bg-card border-2 border-dashed rounded-lg p-12 text-center">
      <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <div className="font-semibold">No company selected</div>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Choose a company to start working with its data.
      </p>
      <Link to="/companies">
        <Button variant="default" size="sm">
          Select Company
        </Button>
      </Link>
    </div>
  );
}
