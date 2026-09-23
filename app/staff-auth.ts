import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

// Authenticated email is supplied by Sites after ChatGPT sign-in.
const STAFF_EMAILS = new Set(["sensoredrooster.com@gmail.com"]);
export function isStaffUser(user: ChatGPTUser | null) {
  return !!user && STAFF_EMAILS.has(user.email.trim().toLowerCase());
}
export async function isStaff() {
  const user = await getChatGPTUser();
  return isStaffUser(user);
}
