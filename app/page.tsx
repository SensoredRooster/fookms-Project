import Inventory from "./workspace";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { isStaffUser } from "./staff-auth";
export const dynamic = "force-dynamic";
type WorkspaceView = "floor" | "orders" | "inventory" | "stations" | "catalog";
const views: WorkspaceView[] = ["floor", "orders", "inventory", "stations", "catalog"];
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requestedView = (await searchParams).view;
  const view: WorkspaceView = views.includes(requestedView as WorkspaceView) ? requestedView as WorkspaceView : "floor";
  const user = await getChatGPTUser();
  if (isStaffUser(user)) return <Inventory initialView={view} />;

  return <div className="gateway">
    <header className="gateway-top"><div className="gateway-brand"><span className="gateway-mark">▦</span><strong>Station Inventory</strong></div><a href="/order">Customer order form →</a></header>
    <main className="gateway-main">
      <div className="gateway-panel">
        <div className="gateway-label">STAFF WORKSPACE</div>
        <h1>Open your workstation floor</h1>
        <p>Your floor plan, station handoffs, orders, inventory, and item catalog are in the workspace.</p>
        {user ? <div className="gateway-alert" role="alert">Signed in as <strong>{user.email}</strong>. This account does not have access to the workspace. Switch to an account that has been invited.</div> : null}
        <a className="gateway-button" href={user ? chatGPTSignOutPath(`/?view=${view}`) : chatGPTSignInPath(`/?view=${view}`)} target="_top">{user ? "Switch ChatGPT account" : "Sign in to workspace"} →</a>
      </div>
      <nav className="gateway-sections" aria-label="Workspace sections">
        <div className="gateway-sections-title">Inside your workspace</div>
        {views.map((section, index) => <a key={section} href={user ? chatGPTSignOutPath(`/?view=${section}`) : chatGPTSignInPath(`/?view=${section}`)} target="_top"><span>{String(index + 1).padStart(2, "0")}</span><strong>{({floor:"Floor plan",orders:"Orders",inventory:"Inventory",stations:"Workstations",catalog:"Item catalog"})[section]}</strong><small>{({floor:"Arrange stations, rooms, aisles, and walls",orders:"Phone, walk-in, and online orders",inventory:"Stock levels and movement history",stations:"Station queues and handoffs",catalog:"Items and station routes"})[section]}</small></a>)}
      </nav>
    </main>
  </div>;
}
