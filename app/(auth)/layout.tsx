export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container" style={{ padding: '48px 0' }}>
      <div className="card" style={{ maxWidth: 620, margin: '0 auto', padding: 24 }}>
        {children}
      </div>
    </main>
  )
}
