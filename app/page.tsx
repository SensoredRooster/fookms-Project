import Inventory from "./workspace";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { isStaffUser } from "./staff-auth";
export const dynamic = "force-dynamic";
type WorkspaceView = "home" | "floor" | "orders" | "inventory" | "customers" | "stations" | "catalog" | "issues";
const views: WorkspaceView[] = ["home", "floor", "orders", "inventory", "customers", "stations", "catalog", "issues"];
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const requestedView = (await searchParams).view;
  const view: WorkspaceView = views.includes(requestedView as WorkspaceView) ? requestedView as WorkspaceView : "home";
  const user = await getChatGPTUser();
  if (isStaffUser(user)) return <Inventory initialView={view} />;

  return <div className="gateway">
    <header className="gateway-top"><div className="gateway-brand"><span className="gateway-mark">▦</span><strong>Station Inventory</strong></div><a href="/order">Customer order form →</a></header>
    <main className="gateway-main">
      <div className="gateway-panel">
        <div className="gateway-label">STAFF WORKSPACE</div>
        <h1>Open your operations workspace</h1>
        <p>Your home dashboard, customers, floor plan, station handoffs, orders, inventory, item catalog, and issue notes are in the workspace.</p>
        {user ? <div className="gateway-alert" role="alert">Signed in as <strong>{user.email}</strong>. This account does not have access to the workspace. Switch to an account that has been invited.</div> : null}
        <a className="gateway-button" href={user ? chatGPTSignOutPath(`/?view=${view}`) : chatGPTSignInPath(`/?view=${view}`)} target="_top">{user ? "Switch ChatGPT account" : "Sign in to workspace"} →</a>
      </div>
      <nav className="gateway-sections" aria-label="Workspace sections">
        <div className="gateway-sections-title">Inside your workspace</div>
        {views.map((section, index) => <a key={section} href={user ? chatGPTSignOutPath(`/?view=${section}`) : chatGPTSignInPath(`/?view=${section}`)} target="_top"><span>{String(index + 1).padStart(2, "0")}</span><strong>{({home:"Home",floor:"Floor plan",orders:"Orders",inventory:"Inventory",customers:"Customers",stations:"Workstations",catalog:"Item catalog",issues:"Issue notepad"})[section]}</strong><small>{({home:"Operations overview and quick links",floor:"Arrange stations, rooms, aisles, and walls",orders:"Phone, walk-in, and online orders",inventory:"Stock by workstation and movement history",customers:"Saved customer profiles and contact details",stations:"Station queues and handoffs",catalog:"Items and station routes",issues:"Record problems for the developer"})[section]}</small></a>)}
      </nav>
    </main>
  </div>;
}
