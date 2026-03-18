import { AIPayload } from './buildAIPayload.js'

export interface WeeklyEmail {
    subject: string
    body: string
}

export async function composeWeeklyEmail(payload: AIPayload): Promise<WeeklyEmail> {
    let apiKey = process.env.PEARLSCOUT_GEMINI_API_KEY || process.env.GEMINI_API_KEY

    // HACK: If not in env, try reading .env.local directly (useful for local dev synchronization issues)
    if (!apiKey) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const envPath = path.join(process.cwd(), '.env.local');
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8');
                const match = content.match(/PEARLSCOUT_GEMINI_API_KEY=(.*)/) || content.match(/GEMINI_API_KEY=(.*)/);
                if (match && match[1]) {
                    apiKey = match[1].trim();
                }
            }
        } catch (e) {
            console.error('Failed to read .env.local manually:', e);
        }
    }

    if (!apiKey) {
        throw new Error(`Gemini API key is not set. Environment variable and manual .env.local read both failed.`)
    }

    const systemPrompt = `You are writing a short weekly performance memo for a business owner.

This is not a marketing email.
This is not a consultant report.
This is not a technical analytics summary.

You are providing a calm, concise explanation of the week's performance.

Rules:
- Do not invent causes.
- Do not speculate about visitor psychology.
- Do not reinterpret the provided focus_type.
- Do not introduce additional recommendations.
- Do not use analytics jargon (avoid terms like session duration, bounce rate, funnel, engagement time, zero-length interactions, baseline deviation, misconfiguration).
- Do not use greetings (no “Dear…”).
- Do not use sign-offs (no “Sincerely…”).
- Do not use section headings.
- Do not use bullet points.
- Do not label sections (e.g., “Overall Focus”, “Website Visits”).

Tone:
Calm, analytical, restrained.
Neutral and professional.
No hype.
No emotional persuasion.
No dramatic language.

Structure:
- 3–4 short paragraphs.
- Section order: visibility, then intent, then submissions, then reliability (if applicable).
- The body must consist ONLY of the text provided in deterministic_summary (visibility, intent, submissions, reliability) in that order.
- Do not add any other text, greetings, sign-offs, or forward-looking statements to the body.
- Do not add any closing sentences.

If integrity_status is "low":
- Use the provided reliability text.
- Do not add additional warnings or repeated recommendations.

Output format:
{
  "subject": "...",
  "body": "..."
}
`

    const prompt = `Here is the data for this week's report:
${JSON.stringify(payload, null, 2)}
`

    // Using Google AI SDK or direct fetch. Direct fetch is safer for dependency reasons.
    // Using Google AI SDK or direct fetch. Direct fetch is safer for dependency reasons.
    // Using the exact version string provided by the user's dashboard info
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\n${prompt}\n\nPlease respond with a JSON object containing "subject" and "body" keys. Respond with JSON ONLY.`
                }]
            }]
        })
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Gemini API error: ${response.status} ${errorBody}`)
    }

    const data = await response.json()
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

    // Robust JSON extraction
    if (text.includes('```json')) {
        text = text.split('```json')[1].split('```')[0].trim()
    } else if (text.includes('```')) {
        text = text.split('```')[1].split('```')[0].trim()
    }

    try {
        return JSON.parse(text)
    } catch (err) {
        console.error('Failed to parse Gemini response:', text)
        throw new Error('AI response was not valid JSON')
    }
}
