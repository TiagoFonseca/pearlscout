import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: { method: string; headers: Record<string, string | undefined>; body: { property_id: string; display_name: string } }, res: { status: (code: number) => { end: () => void; json: (body: unknown) => void }; json?: never }) {
    if (req.method !== 'POST') return res.status(405).end()

    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'No session' })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Invalid user' })

    const { property_id, display_name } = req.body

    await supabase.from('user_properties').upsert(
        {
            user_id: user.id,
            property_id,
            display_name
        },
        { onConflict: 'user_id' }
    )

    res.status(200).json({ ok: true })
}
