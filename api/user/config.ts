import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'http'

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
    req: IncomingMessage & { headers: Record<string, string | undefined> },
    res: ServerResponse & { status: (c: number) => typeof res; json: (body: unknown) => void }
): Promise<void> {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '')
        if (!token) {
            res.status(401).json({ error: 'No session' })
            return
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) {
            res.status(401).json({ error: 'Invalid user' })
            return
        }

        const { data } = await supabase
            .from('user_settings')
            .select(`
        property_id,
        conversion_event,
        conversion_confidence,
        enquiry_page_path,
        enquiry_confidence,
        analysis_ready
      `)
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

        if (!data) {
            res.status(200).json({ configured: false })
            return
        }

        // Fetch website name
        const { data: propData } = await supabase
            .from('user_properties')
            .select('display_name')
            .eq('user_id', user.id)
            .eq('property_id', data.property_id)
            .limit(1)
            .maybeSingle()

        res.status(200).json({
            configured: true,
            propertyId: data.property_id,
            websiteName: propData?.display_name || 'My Website',
            conversionEvent: data.conversion_event,
            conversionConfidence: data.conversion_confidence,
            enquiryPage: data.enquiry_page_path,
            enquiryConfidence: data.enquiry_confidence,
            analysisReady: data.analysis_ready
        })
    } catch (err) {
        console.error('[api/user/config] fetch failed:', err)
        // Never crash: treat any DB/network failure as an unconfigured state
        res.status(200).json({ configured: false })
    }
}
