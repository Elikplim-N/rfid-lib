import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

export interface User {
  id: string
  username: string
  role: 'admin' | 'librarian' | 'readonly'
  passwordHash: string
  createdAt: string
  lastLogin?: string
  isActive: boolean
}

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
}

// Environment-based configuration
const CONFIG = {
  sessionDuration: 8 * 60 * 60 * 1000, // 8 hours
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  bcryptRounds: 12,
}

// Simple in-memory storage for demo (in production, use secure backend)
let users: User[] = []
let sessions: Session[] = []
let loginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map()

// Initialize default admin user
export async function initializeAuth() {
  const adminUsername = import.meta.env.VITE_ADMIN_USER || 'admin'
  const adminPassword = import.meta.env.VITE_ADMIN_PASS || 'admin'
  
  // Check if admin already exists
  const existingAdmin = users.find(u => u.username === adminUsername)
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, CONFIG.bcryptRounds)
    const adminUser: User = {
      id: uuidv4(),
      username: adminUsername,
      role: 'admin',
      passwordHash,
      createdAt: new Date().toISOString(),
      isActive: true,
    }
    users.push(adminUser)
  }
}

// Security: Rate limiting for login attempts
function checkRateLimit(identifier: string): boolean {
  const attempts = loginAttempts.get(identifier)
  if (!attempts) return true
  
  const now = Date.now()
  if (attempts.count >= CONFIG.maxLoginAttempts) {
    if (now - attempts.lastAttempt < CONFIG.lockoutDuration) {
      return false // Still locked out
    }
    // Reset attempts after lockout period
    loginAttempts.delete(identifier)
  }
  return true
}

function recordFailedAttempt(identifier: string) {
  const attempts = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 }
  loginAttempts.set(identifier, {
    count: attempts.count + 1,
    lastAttempt: Date.now(),
  })
}

// Authentication functions
export async function authenticate(
  username: string,
  password: string,
  clientId: string = 'web'
): Promise<{ success: boolean; token?: string; user?: Omit<User, 'passwordHash'>; error?: string }> {
  // Rate limiting
  if (!checkRateLimit(clientId)) {
    return { success: false, error: 'Too many failed attempts. Please try again later.' }
  }

  // Input validation
  if (!username?.trim() || !password?.trim()) {
    recordFailedAttempt(clientId)
    return { success: false, error: 'Username and password are required' }
  }

  const user = users.find(u => u.username === username && u.isActive)
  if (!user) {
    recordFailedAttempt(clientId)
    return { success: false, error: 'Invalid credentials' }
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash)
  if (!isValidPassword) {
    recordFailedAttempt(clientId)
    return { success: false, error: 'Invalid credentials' }
  }

  // Clear failed attempts on successful login
  loginAttempts.delete(clientId)

  // Create session
  const sessionToken = generateSecureToken()
  const session: Session = {
    id: uuidv4(),
    userId: user.id,
    token: sessionToken,
    expiresAt: new Date(Date.now() + CONFIG.sessionDuration).toISOString(),
    createdAt: new Date().toISOString(),
  }

  sessions.push(session)

  // Update last login
  user.lastLogin = new Date().toISOString()

  const { passwordHash, ...userWithoutPassword } = user
  return { 
    success: true, 
    token: sessionToken, 
    user: userWithoutPassword 
  }
}

export function validateSession(token: string): { valid: boolean; user?: Omit<User, 'passwordHash'> } {
  if (!token) return { valid: false }

  const session = sessions.find(s => s.token === token)
  if (!session) return { valid: false }

  // Check if session is expired
  if (new Date() > new Date(session.expiresAt)) {
    // Remove expired session
    sessions = sessions.filter(s => s.id !== session.id)
    return { valid: false }
  }

  const user = users.find(u => u.id === session.userId && u.isActive)
  if (!user) return { valid: false }

  const { passwordHash, ...userWithoutPassword } = user
  return { valid: true, user: userWithoutPassword }
}

export function logout(token: string): boolean {
  const sessionIndex = sessions.findIndex(s => s.token === token)
  if (sessionIndex !== -1) {
    sessions.splice(sessionIndex, 1)
    return true
  }
  return false
}

// Token generation
function generateSecureToken(): string {
  return uuidv4() + '.' + uuidv4().replace(/-/g, '')
}

// Session cleanup - remove expired sessions
export function cleanupExpiredSessions() {
  const now = new Date()
  sessions = sessions.filter(s => new Date(s.expiresAt) > now)
}

// Role-based access control
export function hasPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = { readonly: 0, librarian: 1, admin: 2 }
  return roleHierarchy[userRole as keyof typeof roleHierarchy] >= 
         roleHierarchy[requiredRole as keyof typeof roleHierarchy]
}

// Secure storage utilities
export function secureStore(key: string, value: string) {
  try {
    // In production, consider encrypting sensitive data
    localStorage.setItem(key, value)
  } catch (error) {
    console.warn('Failed to store data securely:', error)
  }
}

export function secureRetrieve(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn('Failed to retrieve secure data:', error)
    return null
  }
}

export function secureRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('Failed to remove secure data:', error)
  }
}