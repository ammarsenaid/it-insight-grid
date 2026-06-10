import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import * as Lucide from "lucide-react";
import { ArrowLeft, ShoppingBag, CheckCircle2, Clock, Users as UsersIcon, Send } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { useData } from "@/lib/data/store";
import { currentRequesterFor, submitCatalogRequest } from "@/lib/data/tickets";
import { useRole } from "@/lib/permissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/service-catalog/$id")({
  head: () => ({ meta: [{ title: "Service Catalog Item · IT Knowledge Center" }] }),
  component: CatalogItemPage,
});

function CatalogItemPage() {
  const { id } = Route.useParams();
  const data = useData();
  const role = useRole();
  const navigate = useNavigate();
  const item = data.catalog.find((c) => c.id === id);
  const [values, setValues] = useState<Record<string, string>>({});

  if (!item) {
    return (
      <div>
        <PageHeader title="Service not found" actions={<Link to="/service-catalog"><Button variant="secondary"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to catalog</Button></Link>} />
      </div>
    );
  }

  const Icon = (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ?? ShoppingBag;
  const requester = currentRequesterFor(role);

  const handleSubmit = () => {
    const missing = item.fields.filter((f) => f.required && !(values[f.key] ?? "").trim());
    if (missing.length > 0) return toast.error(`Required: ${missing.map((m) => m.label).join(", ")}`);
    const ticket = submitCatalogRequest(item, requester, values);
    toast.success(`Request ${ticket.number} submitted`, { description: `${item.name} — IT will handle this shortly.` });
    navigate({ to: "/tickets/$id", params: { id: ticket.id } });
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/service-catalog" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Service Catalog
        </Link>
        <span>/</span>
        <span className="text-foreground">{item.category}</span>
      </div>

      <PageHeader title={item.name} description={item.description} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Request form" description="Fill in the details. Required fields are marked with *.">
            <div className="space-y-4">
              {item.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}{f.required && " *"}</Label>
                  {f.type === "text" && <Input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} />}
                  {f.type === "textarea" && <Textarea rows={4} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} />}
                  {f.type === "date" && <Input type="date" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />}
                  {f.type === "select" && (
                    <Select value={values[f.key] ?? ""} onValueChange={(v) => setValues((vs) => ({ ...vs, [f.key]: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Link to="/service-catalog"><Button type="button" variant="ghost">Cancel</Button></Link>
                <Button onClick={handleSubmit}><Send className="mr-1.5 h-4 w-4" /> Submit request</Button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Service details">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="text-[11px] text-muted-foreground">{item.category}</div>
              </div>
            </div>
            <KV k="Default priority" v={item.defaultPriority} icon={CheckCircle2} />
            <KV k="Estimated time" v={item.estimatedTime} icon={Clock} />
            <KV k="Requester" v={requester} icon={UsersIcon} />
          </SectionCard>

          <SectionCard title="What happens next">
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li>1. Your request becomes a ticket and is routed to the {item.defaultTeam} team.</li>
              <li>2. You will receive notifications inside the portal as it progresses.</li>
              <li>3. Track status anytime under <Link to="/my-requests" className="text-primary hover:underline">My Requests</Link>.</li>
            </ol>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, icon: Icon }: { k: string; v: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/30 py-1.5 last:border-b-0">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {k}
      </span>
      <span className="text-right text-xs capitalize">{v}</span>
    </div>
  );
}
