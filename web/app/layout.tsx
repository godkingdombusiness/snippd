import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Snippd — Activate Your Agent',
  description: 'Your autonomous shopping intelligence. Set up your agent in 2 minutes.',
  openGraph: {
    title: 'Snippd — Activate Your Agent',
    description: 'The AI that hunts deals while you sleep.',
    siteName: 'Snippd',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body>{children}</body>
    </html>
  )
}
