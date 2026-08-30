import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const GEMINI_2_FLASH_ENDPOINT = 'gemini-2.0-flash:generateContent'
const GEMINI_3_FLASH_ENDPOINT = 'gemini-3.6-flash:generateContent'

// Compatibility shim for the original agent module. Gemini 2.0 Flash was shut
// down in June 2026; replace the legacy endpoint at transform time so existing
// installs keep working without changing the agent's public API.
const migrateGeminiEndpoint = {
  name: 'offerclaw-gemini-endpoint-migration',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/agent.js') || !code.includes(GEMINI_2_FLASH_ENDPOINT)) {
      return null
    }

    return {
      code: code.replace(GEMINI_2_FLASH_ENDPOINT, GEMINI_3_FLASH_ENDPOINT),
      map: null,
    }
  },
}

export default defineConfig({
  plugins: [migrateGeminiEndpoint, react()],
})
