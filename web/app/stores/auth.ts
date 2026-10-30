import type { User } from '~~/shared/types/fns'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  async function logout() {
    try {
      await $fetch('/api/frontend/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      await navigateTo('/login')
    }
  }
  return { user, logout }
})
