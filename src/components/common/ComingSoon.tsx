import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./PageHeader";

export function ComingSoon({
  title,
  description,
  batch,
}: {
  title: string;
  description?: string;
  batch?: string;
}) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Dashboard
            </Button>
          </Link>
        }
      />
      <div className="glass-card flex flex-col items-center justify-center rounded-2xl px-8 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Construction className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">Reserved for an upcoming batch</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          The {title} module is part of the IT Knowledge Center specification and will be implemented
          {batch ? ` in ${batch}` : " in an upcoming batch"}. The navigation, permissions, and design
          system are already wired so this page can be filled in without touching the shell.
        </p>
      </div>
    </div>
  );
}
