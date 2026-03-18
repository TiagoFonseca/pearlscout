import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req, res) {
    try {
        const accessToken = req.headers.authorization?.replace('Bearer ', '')
        if (!accessToken) return res.status(401).json({ error: 'No session' })

        // Get user from Supabase JWT
        const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
        if (authError || !user) return res.status(401).json({ error: 'Invalid user' })

        // Get stored refresh token
        const { data: connection } = await supabase
            .from('google_connections')
            .select('refresh_token')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

        if (!connection) {
            return res.status(200).json({
                reconnectRequired: true
            })
        }

        // Exchange refresh token for new access token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                refresh_token: connection.refresh_token,
                grant_type: 'refresh_token'
            })
        })

        const tokenData = await tokenRes.json()

        if (!tokenData.access_token) {
            return res.status(200).json({
                reconnectRequired: true
            })
        }

        const googleAccessToken = tokenData.access_token

        // Get GA4 properties
        const gaRes = await fetch(
            'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
            {
                headers: {
                    Authorization: `Bearer ${googleAccessToken}`
                }
            }
        )

        const gaData = await gaRes.json()

        if (!gaData.accountSummaries) {
            return res.status(200).json({
                properties: []
            })
        }

        const properties = (gaData.accountSummaries || []).flatMap(acc =>
            (acc.propertySummaries || []).map(p => ({
                property_id: p.property.replace('properties/', ''),
                display_name: p.displayName
            }))
        )

        console.log('[GA properties]', properties)

        res.status(200).json({ properties })

    } catch (e) {
        console.error('[ga-properties] error:', e)
        res.status(500).json({ error: 'PROPERTIES_FETCH_FAILED' })
    }
}
