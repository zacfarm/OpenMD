import './globals.css'  
import 'react-big-calendar/lib/css/react-big-calendar.css'  
import { Toaster } from 'sonner'

export const metadata = {  
  title: 'OpenMD',  
  description: 'Healthcare marketplace for public ratings, scheduling, and tenant workflows.',  
}

export default function RootLayout({ children }: { children: React.ReactNode }) {  
  return (  
    <html lang="en" suppressHydrationWarning>  
      <body suppressHydrationWarning>  
        {children}    
        <Toaster richColors position="top-right" />  
      </body>  
    </html>  
  )  
} 