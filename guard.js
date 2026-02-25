// guard.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(
  "https://ysfmxpubcyrkxdtzubvp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZm14cHViY3lya3hkdHp1YnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDgwODMsImV4cCI6MjA4NzE4NDA4M30.gbJ39R8Dw5jCbGCZMXw8cCsD3y9UiiedPcxwHG0-r-E"        
  )

export async function guard(mode) {

  const { data: { session } } = await supabase.auth.getSession()

  // PUBLIC PAGE — never interfere
  if (mode === "public") return

  // USER NOT LOGGED IN
  if (!session) {
    if (mode === "app") {
      location.replace("/signup.html")
    }
    return
  }

  const { data: { user }, error } = await supabase.auth.getUser()

  // Token invalid OR user deleted in Supabase
  if (!user || error) {
    console.log("Invalid or stale session → clearing")

    await supabase.auth.signOut()

    if (mode !== "public")
      location.replace("/signup.html")

    return
  }
  
  // LOGGED IN USER VISITING SIGNUP
  if (mode === "guestOnly") {
    location.replace("/activate.html")
    return
  }

  // APP PAGE → ensure profile
  if (mode === "app") {
    const user = session.user

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile) {
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? null
      })
      location.reload()
    }
  }
}