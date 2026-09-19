import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Tell — Can your story hold up?',description:'A live Gemini bluff investigation. Tell your story. Follow the evidence.'};
// Browser extensions can add root attributes before hydration. Only that root is suppressed.
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;}
