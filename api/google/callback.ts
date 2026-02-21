import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://pearlscout.vercel.app/api/google/callback"
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    // Get Google account info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2"
    });

    const userInfo = await oauth2.userinfo.get();

    // Supabase admin client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Store tokens
    await supabase.from("google_connections").upsert({
      email: userInfo.data.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      expiry_date: tokens.expiry_date
    });

    // Redirect back to app
    res.redirect("/connected.html");

  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth failed");
  }
}