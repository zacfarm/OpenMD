"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

const sections = [
  { href: "/billing/service-tracker", label: "1. Billing service tracker" },
  { href: "/billing/claims", label: "2. Submit claim and claim history" },
  { href: "/billing/payments", label: "3. Post payment" },
];

export default function BillingSectionNav() {
  const pathname = usePathname();
  const router = useRouter();

  const selected = useMemo(() => {
    return (
      sections.find((item) => pathname?.startsWith(item.href))?.href ??
      sections[0].href
    );
  }, [pathname]);

  return (
    <article className="card" style={{ padding: 18 }}>
      <label style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        Billing pages
        <select
          className="field"
          value={selected}
          onChange={(event) => router.push(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.href} value={section.href}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
