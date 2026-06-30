import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

type IdentityTab = "users" | "teams" | "departments";

const DISABLED_TITLE = "Temporarily disabled while this route is stabilized.";

const tabs: Array<{ id: IdentityTab; label: string }> = [
  { id: "users", label: "Users" },
  { id: "teams", label: "Teams" },
  { id: "departments", label: "Departments" },
];

const actions = [
  "Add user",
  "New team",
  "New department",
  "Edit permissions",
  "Edit page visibility",
];

export const Route = createFileRoute("/admin/identity")({
  head: () => ({
    meta: [{ title: "Identity & Access · IT Knowledge Center" }],
  }),
  component: IdentityAndAccessPage,
  errorComponent: IdentityRouteError,
});

function IdentityRouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  console.error("Identity & Access route error", error);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <section className="mx-auto max-w-3xl rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">
          Identity &amp; Access could not be rendered
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Unknown route error."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </section>
    </main>
  );
}

function IdentityAndAccessPage() {
  const [activeTab, setActiveTab] = useState<IdentityTab>("users");

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Identity &amp; Access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Access Control</p>
        </header>

        <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="border-b px-4 pt-4">
            <div
              role="tablist"
              aria-label="Access control subjects"
              className="flex gap-1 overflow-x-auto"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap rounded-t-md border-b-2 px-4 py-2 text-sm font-medium ${
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            <p className="text-sm text-muted-foreground">
              Identity management is temporarily isolated while the unified
              console is stabilized.
            </p>

            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled
                  title={DISABLED_TITLE}
                  className="cursor-not-allowed rounded-md border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground opacity-70"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
