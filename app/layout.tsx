import "./globals.css";
import "react-big-calendar/lib/css/react-big-calendar.css";
import Footer from "../components/Footer/Footer";

export const metadata = {
  title: "OpenMD",
  description:
    "Healthcare marketplace for public ratings, scheduling, and tenant workflows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Footer />
      </body>
    </html>
  );
}
