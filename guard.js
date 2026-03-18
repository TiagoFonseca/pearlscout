// guard.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(
  "https://ysfmxpubcyrkxdtzubvp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZm14cHViY3lya3hkdHp1YnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDgwODMsImV4cCI6MjA4NzE4NDA4M30.gbJ39R8Dw5jCbGCZMXw8cCsD3y9UiiedPcxwHG0-r-E"
)

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
}