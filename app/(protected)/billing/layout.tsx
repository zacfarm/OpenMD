import type { ReactNode } from "react";

import BillingSectionNav from "@/components/billing/BillingSectionNav";

export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <section className="dashboard-shell">
      <article className="card dashboard-hero">
        <div>
          <h1>Billing</h1>
          <p className="dashboard-subtext">
            Billing workspace with separate pages for tracker, claims, and
            payments.
          </p>
        </div>
      </article>

      <BillingSectionNav />

      {children}
    </section>
  );
}
