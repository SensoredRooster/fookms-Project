import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

// Authenticated email is supplied by Sites after ChatGPT sign-in.
// Tester addresses are configured in Sites runtime settings, never published in source.
const OWNER_EMAIL = "sensoredrooster.com@gmail.com";
export function isStaffUser(user: ChatGPTUser | null) {
  if (!user) return false;
  const email = user.email.trim().toLowerCase();
  return email === OWNER_EMAIL || (env.STAFF_TESTER_EMAILS || "")
    .split(",")
    .some(allowed => allowed.trim().toLowerCase() === email);
}
export async function isStaff() {
  const user = await getChatGPTUser();
  return isStaffUser(user);
}
