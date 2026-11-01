import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'AgentMeter — usage ledger',description:'A private ledger for agent usage and costs.',icons:{icon:'/logo-symbol-only.png'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
