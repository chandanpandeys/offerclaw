export default function handler(_req, res) {
  const env = globalThis.process?.env || {}

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    runtime: 'vercel-functions',
    ai: {
      configured: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
      model: env.GEMINI_MODEL || 'gemini-3.7-flash',
      api: 'interactions',
    },
    jobs: {
      configured: Boolean(env.JSEARCH_API_KEY || env.RAPIDAPI_KEY),
      provider: 'jsearch',
    },
  })
}
