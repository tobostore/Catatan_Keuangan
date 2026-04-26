export async function askGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      throw new Error(`Groq error: ${res.status}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    }

    return data.choices?.[0]?.message?.content ?? ""
  } catch (err) {
    console.error("Groq API error:", err)
    return ""
  }
}

export async function askGroqDeterministic(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      throw new Error(`Groq error: ${res.status}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    }

    return data.choices?.[0]?.message?.content ?? ""
  } catch (err) {
    console.error("Groq API error:", err)
    return ""
  }
}

export function parseGroqJSON<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, "").trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}
