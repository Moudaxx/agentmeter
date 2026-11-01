import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import Dashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/dashboard');return <><header><a href="/"><strong>AgentMeter</strong></a><nav><a href="/docs">Developer docs</a><a href={chatGPTSignOutPath('/')} target="_top">Sign out</a></nav></header><Dashboard/></>;}
