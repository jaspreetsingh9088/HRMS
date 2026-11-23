import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'PeopleFlow HRMS', description: 'Multi-company HR management platform' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
