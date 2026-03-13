import './globals.css'

export const metadata = {
  title: 'OpenMD',
  description: 'Healthcare marketplace for public ratings, scheduling, and tenant workflows.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
