import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'http'

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
    req: IncomingMessage & { headers: Record<string, string | undefined> },
    res: ServerResponse & { status: (c: number) => typeof res; json: (body: unknown) => void }
) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'No session' })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Invalid user' })

    const { data: property } = await supabase
        .from('user_properties')
        .select('property_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

    if (!property?.property_id) {
        return res.status(200).json({
            propertySelected: false,
            analysisReady: false
        })
    }

    res.status(200).json({
        connected: true
    })
}