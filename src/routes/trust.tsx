import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Database, UserCheck, FileText, Mail } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Security — ERPOVO" },
      {
        name: "description",
        content:
          "How ERPOVO handles security, privacy, and your business data. App-owned trust page maintained by the ERPOVO team.",
      },
      { property: "og:title", content: "Trust & Security — ERPOVO" },
      {
        property: "og:description",
        content:
          "Security controls, privacy practices, and data handling for ERPOVO customers.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border rounded-xl p-6 bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link to="/" className="font-bold text-xl text-primary">
            ERPOVO
          </Link>
          <Link to="/contact" className="text-sm text-primary hover:underline">
            Contact us
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> Trust & Security
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            How ERPOVO protects your business data
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            This page is maintained by the ERPOVO team to answer common security and privacy
            questions about the ERPOVO platform. It describes controls that are currently enabled
            in the product. It is not an independent certification or audit report.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Section icon={UserCheck} title="Access & authentication">
            <p>
              Sign-in uses email/password and Google sign-in. Each session is tied to your account
              and your device. Owners and admins can view and revoke active devices for their
              workspace from the Devices screen.
            </p>
            <p>
              Inside a workspace, access is controlled by company membership and per-role
              permissions. Sensitive actions such as payroll, stock writes, and platform admin
              tools require explicit permissions.
            </p>
          </Section>

          <Section icon={Lock} title="Data in transit & at rest">
            <p>
              All traffic between your browser, the mobile app, and ERPOVO servers is sent over
              HTTPS/TLS. Application data is stored in a managed Postgres database with
              row-level security policies that scope reads and writes to your own company.
            </p>
            <p>
              Secrets such as API keys and service credentials are stored server-side and are
              never shipped to the browser or the mobile app.
            </p>
          </Section>

          <Section icon={Database} title="What we collect & why">
            <p>
              ERPOVO stores the business records you enter — invoices, parties, items, payments,
              stock movements, employees, and related documents — so the app can show them back
              to you, sync them across your devices, and generate reports.
            </p>
            <p>
              We also collect basic account information (name, email, phone) and limited device
              metadata used to enforce the device limit on your plan.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Local vs Cloud Mode">
            <p>
              ERPOVO supports a Local/Personal Mode where your data stays on the device in
              browser storage and is never uploaded. Cloud Mode syncs your records to your
              workspace so you can access them across devices.
            </p>
            <p>
              Switching modes never silently uploads existing local data. Sync only runs after
              you sign in to a cloud workspace.
            </p>
          </Section>

          <Section icon={FileText} title="Backups, retention & deletion">
            <p>
              You can export your data at any time using the Backup and Export utilities inside
              the app. Deleted records are first moved to the Recycle Bin so they can be
              restored; permanent deletion removes them from your workspace.
            </p>
            <p>
              If you want your account and workspace data fully removed, contact support and we
              will process the request.
            </p>
          </Section>

          <Section icon={Mail} title="Reporting a security issue">
            <p>
              If you believe you have found a security vulnerability in ERPOVO, please contact us
              through the{" "}
              <Link to="/contact" className="text-primary hover:underline">
                Contact page
              </Link>
              . Please do not publicly disclose the issue until we have had a chance to
              investigate and respond.
            </p>
          </Section>
        </div>

        <div className="border rounded-xl p-6 bg-muted/30 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Shared responsibility.</strong> ERPOVO provides
            the application, infrastructure controls, and security features described above. As a
            customer, you are responsible for protecting your account credentials, choosing who
            has access to your workspace, and configuring roles and permissions appropriately for
            your team.
          </p>
          <p className="mt-2">
            This page describes current product behavior and is updated as the product evolves.
            It is not a contract, certification, or guarantee of any specific regulatory
            compliance outcome.
          </p>
        </div>
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-muted-foreground flex flex-wrap gap-4 justify-between">
          <div>© {new Date().getFullYear()} ERPOVO</div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <Link to="/contact" className="hover:text-primary">
              Contact
            </Link>
            <Link to="/pricing" className="hover:text-primary">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
