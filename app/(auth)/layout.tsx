import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="container auth-shell">
      <div className="auth-home-row">
        <Link
          href="/"
          className="auth-home-link"
          aria-label="Go to OpenMD home page"
        >
          <span className="auth-home-mark" aria-hidden="true" />
          <span className="auth-home-wordmark">OpenMD</span>
        </Link>
      </div>

      <div className="auth-grid">
        <section className="auth-aside" aria-label="OpenMD access overview">
          <p className="auth-kicker">OpenMD Control Center</p>
          <h2>Run your medical operations from one secure workspace.</h2>
          <p>
            Coordinate provider schedules, bookings, credentials, and team
            access with workflow-aware tenant controls.
          </p>
          <ul className="auth-points">
            <li>Role-based permissions for every care team</li>
            <li>Credential reviews and compliance visibility</li>
            <li>Booking and notification workflows in sync</li>
          </ul>
        </section>

        <section className="card auth-card">{children}</section>
      </div>
    </main>
  );
}
