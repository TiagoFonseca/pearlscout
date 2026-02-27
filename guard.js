// guard.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(
  "https://ysfmxpubcyrkxdtzubvp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZm14cHViY3lya3hkdHp1YnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDgwODMsImV4cCI6MjA4NzE4NDA4M30.gbJ39R8Dw5jCbGCZMXw8cCsD3y9UiiedPcxwHG0-r-E"
)

/**
 * Checks whether the current user has a Google Analytics connection.
 * Returns true if a row exists in google_connections for this user.
 */
async function hasGAConnection(userId) {
  const { data } = await supabase
    .from("google_connections")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}

/**
 * guard(mode)
 *
 * Routing states:
 *   "public"    — Never redirect. Always allow.
 *   "app"       — Requires login. If logged in + GA connected → redirect to /connected.html
 *   "connected" — Requires login + GA connection. If not logged → /. If no GA → /activate.html
 */
export async function guard(mode) {

  // PUBLIC PAGE — never interfere
  if (mode === "public") return

  const { data: { session } } = await supabase.auth.getSession()

  // USER NOT LOGGED IN
  if (!session) {
    location.replace("/")
    return
  }

  const { data: { user }, error } = await supabase.auth.getUser()

  // Token invalid OR user deleted in Supabase
  if (!user || error) {
    console.log("Invalid or stale session → clearing")
    await supabase.auth.signOut()
    location.replace("/")
    return
  }

  const gaConnected = await hasGAConnection(user.id)

  if (mode === "app") {
    // Logged in + GA already connected → skip setup, go to connected
    if (gaConnected) {
      location.replace("/connected.html")
      return
    }
    // Logged in, no GA → stay on activate page (allow)
    return
  }

  if (mode === "connected") {
    // No GA → send back to activate
    if (!gaConnected) {
      location.replace("/activate.html")
      return
    }
    // GA connected → allow
    return
  }
}