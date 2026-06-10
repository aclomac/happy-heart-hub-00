import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Phone, MessageCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact ERPOVO — Book a Demo or Talk to Sales" },
      {
        name: "description",
        content:
          "Get in touch with the ERPOVO team. Book a demo, ask a question, or request a custom enterprise quote.",
      },
      { property: "og:title", content: "Contact ERPOVO" },
      { property: "og:description", content: "Book a demo or talk to sales." },
      { property: "og:url", content: "https://erp-evo-pro.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://erp-evo-pro.lovable.app/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    business_name: "",
    message: "",
    preferred_contact: "email",
    request_type: "demo",
  });
  const [done, setDone] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["platform-settings-public"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_platform_settings");
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.email) throw new Error("Name and email are required");
      const { error } = await supabase.from("contact_requests").insert({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        business_name: form.business_name || null,
        message: form.message || null,
        preferred_contact: form.preferred_contact,
        request_type: form.request_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks! We'll be in touch shortly.");
      setDone(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              E
            </div>
            <div className="font-bold text-lg">ERPOVO</div>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-muted-foreground">
            <Link to="/">Home</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/contact" className="text-foreground font-semibold">
              Contact
            </Link>
          </nav>
          <div className="flex gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-10">
        <div>
          <h1 className="text-4xl font-bold">Let's talk</h1>
          <p className="text-muted-foreground mt-3">
            Book a personalised demo, ask about pricing, or get help with onboarding. We usually
            respond within 1 business day.
          </p>

          <div className="mt-8 space-y-4 text-sm">
            {settings?.support_email && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary" />
                <a href={`mailto:${settings.support_email}`} className="hover:underline">
                  {settings.support_email}
                </a>
              </div>
            )}
            {settings?.support_phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-primary" />
                <a href={`tel:${settings.support_phone}`} className="hover:underline">
                  {settings.support_phone}
                </a>
              </div>
            )}
            {settings?.support_whatsapp && (
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-primary" />
                <a
                  href={`https://wa.me/${settings.support_whatsapp.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  WhatsApp: {settings.support_whatsapp}
                </a>
              </div>
            )}
            {!settings?.support_email &&
              !settings?.support_phone &&
              !settings?.support_whatsapp && (
                <p className="text-muted-foreground">
                  Fill in the form and we'll reach out by your preferred method.
                </p>
              )}
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6">
          {done ? (
            <div className="text-center py-10 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
              <h2 className="text-xl font-bold">Request received</h2>
              <p className="text-sm text-muted-foreground">
                Thanks {form.name.split(" ")[0]}! We'll contact you via {form.preferred_contact}{" "}
                shortly.
              </p>
              <Link to="/">
                <Button variant="outline" size="sm">
                  Back to home
                </Button>
              </Link>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              <div>
                <Label className="text-xs">Reason</Label>
                <Select
                  value={form.request_type}
                  onValueChange={(v) => setForm({ ...form, request_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">Book a demo</SelectItem>
                    <SelectItem value="sales">Talk to sales / custom plan</SelectItem>
                    <SelectItem value="contact">General question</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Business name</Label>
                  <Input
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Preferred contact</Label>
                <Select
                  value={form.preferred_contact}
                  onValueChange={(v) => setForm({ ...form, preferred_contact: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Message</Label>
                <Textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Tell us about your business and what you'd like to see..."
                />
              </div>
              <Button
                type="submit"
                variant="default"
                className="w-full"
                disabled={submit.isPending}
              >
                {submit.isPending ? "Sending..." : "Send Request"}
              </Button>
            </form>
          )}
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between text-sm text-muted-foreground">
          <div>© 2026 ERPOVO. Premium Business ERP.</div>
          <div className="flex gap-4">
            <Link to="/pricing">Pricing</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
