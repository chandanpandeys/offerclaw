import { createContext, useContext } from 'react'

export const AgentContext = createContext(null)

export function useAgent() {
  const value = useContext(AgentContext)
  if (!value) throw new Error('useAgent must be used inside AgentProvider')
  return value
}
