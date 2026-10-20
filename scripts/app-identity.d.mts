import type { Plugin } from 'vite'
export const identityPath: string
export function appIdentity(root: string): {
  app: string
  protocol: number
  workspace: string
}
export function appIdentityPlugin(): Plugin
