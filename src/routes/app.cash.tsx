import {
  createFileRoute,
  Outlet,
  useRouterState,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { BankAccountsSection } from "@/components/erp/cash/BankAccountsSection";
import { CashInHandSection } from "@/components/erp/cash/CashInHandSection";
import { ChequesSection } from "@/components/erp/cash/ChequesSection";
import { LoanAccountsSection } from "@/components/erp/cash/LoanAccountsSection";
import { MobileBankingSection } from "@/components/erp/cash/MobileBankingSection";
import { CashBankStatementSection } from "@/components/erp/cash/CashBankStatementSection";
import { CashReconciliationSection } from "@/components/erp/cash/CashReconciliationSection";
import { BankStatementImportSection } from "@/components/erp/cash/BankStatementImportSection";
import { Landmark, Wallet, FileText, HandCoins, Smartphone, BookOpen, Scale, Upload } from "lucide-react";

export const Route = createFileRoute("/app/cash")({ component: CashShell });

function CashShell() {
  const { pathname } = useLocation();
  return pathname === "/app/cash" ? <CashAndBank /> : <Outlet />;
}

type SectionKey = "bank" | "cash" | "reconcile" | "mobile" | "cheques" | "loans" | "statement";

const tabs: { key: SectionKey; label: string; icon: typeof Wallet }[] = [
  { key: "bank", label: "Bank Accounts", icon: Landmark },
  { key: "cash", label: "Cash In Hand", icon: Wallet },
  { key: "reconcile", label: "Cash Reconciliation", icon: Scale },
  { key: "mobile", label: "Mobile Banking", icon: Smartphone },
  { key: "cheques", label: "Cheques", icon: FileText },
  { key: "loans", label: "Loan Accounts", icon: HandCoins },
  { key: "statement", label: "Statement", icon: BookOpen },
];

const VALID: SectionKey[] = [
  "bank",
  "cash",
  "reconcile",
  "mobile",
  "cheques",
  "loans",
  "statement",
];

function CashAndBank() {
  const companyId = useCurrentCompanyId();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const section: SectionKey = (VALID as string[]).includes(hash) ? (hash as SectionKey) : "bank";

  if (!companyId)
    return (
      <div>
        <PageHeader title="Cash & Bank" />
        <NoCompanySelected />
      </div>
    );

  const subtitle = tabs.find((t) => t.key === section)?.label;

  return (
    <div>
      <PageHeader title="Cash & Bank" subtitle={subtitle} />

      <div className="border-b mb-4 -mt-2 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = section === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate({ to: "/app/cash", hash: t.key })}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {section === "bank" && <BankAccountsSection companyId={companyId} />}
      {section === "cash" && <CashInHandSection companyId={companyId} />}
      {section === "reconcile" && <CashReconciliationSection companyId={companyId} />}
      {section === "mobile" && <MobileBankingSection companyId={companyId} />}
      {section === "cheques" && <ChequesSection companyId={companyId} />}
      {section === "loans" && <LoanAccountsSection companyId={companyId} />}
      {section === "statement" && <CashBankStatementSection companyId={companyId} />}
    </div>
  );
}
