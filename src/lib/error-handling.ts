// Custom error types for different scenarios
export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: unknown) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(message: string, public requiredRole?: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation?: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class NetworkError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class SerialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SerialError'
  }
}

// Error severity levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// Log entry interface
export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
  userId?: string
  sessionId?: string
}

// In-memory log storage (in production, send to external service)
let logs: LogEntry[] = []
const MAX_LOGS = 1000

// Logger class
export class Logger {
  private static instance: Logger
  private userId?: string
  private sessionId?: string

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setContext(userId?: string, sessionId?: string) {
    this.userId = userId
    this.sessionId = sessionId
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      userId: this.userId,
      sessionId: this.sessionId,
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    logs.push(entry)

    // Keep only the latest MAX_LOGS entries
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(-MAX_LOGS)
    }

    // Console logging for development
    if (import.meta.env.DEV) {
      const consoleMethod = level === 'error' || level === 'critical' ? 'error' 
                          : level === 'warn' ? 'warn' 
                          : 'log'
      console[consoleMethod](`[${level.toUpperCase()}] ${message}`, {
        context,
        error: error ? { name: error.name, message: error.message } : undefined
      })
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, unknown>, error?: Error) {
    this.log(LogLevel.WARN, message, context, error)
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, context, error)
  }

  critical(message: string, error?: Error, context?: Record<string, unknown>) {
    this.log(LogLevel.CRITICAL, message, context, error)
  }

  // Get logs with optional filtering
  getLogs(filter?: {
    level?: LogLevel
    userId?: string
    since?: Date
    limit?: number
  }): LogEntry[] {
    let filteredLogs = [...logs]

    if (filter?.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filter.level)
    }

    if (filter?.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === filter.userId)
    }

    if (filter?.since) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filter.since!)
    }

    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(-filter.limit)
    }

    return filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  // Clear logs (admin only)
  clearLogs() {
    logs = []
  }
}

// Global logger instance
export const logger = Logger.getInstance()

// Error handling utilities
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (error instanceof Error && error.message.toLowerCase().includes('network')) return true
  if (error instanceof Error && error.message.toLowerCase().includes('fetch')) return true
  return false
}

// Async error handling wrapper
export async function handleAsync<T>(
  operation: () => Promise<T>,
  errorMessage?: string
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    const message = errorMessage || getErrorMessage(error)
    logger.error(message, error instanceof Error ? error : undefined)
    return { success: false, error: message }
  }
}

// User-friendly error messages
export function getUserFriendlyErrorMessage(error: Error): string {
  switch (error.name) {
    case 'ValidationError':
      return `Invalid input: ${error.message}`
    case 'AuthenticationError':
      return 'Authentication failed. Please check your credentials.'
    case 'AuthorizationError':
      return "You don't have permission to perform this action."
    case 'DatabaseError':
      return 'A database error occurred. Please try again later.'
    case 'NetworkError':
      return 'Network connection failed. Please check your internet connection.'
    case 'SerialError':
      return 'Hardware communication error. Please check device connection.'
    default:
      if (error.message.toLowerCase().includes('not found')) {
        return 'The requested item was not found.'
      }
      if (error.message.toLowerCase().includes('duplicate')) {
        return 'This item already exists in the system.'
      }
      return 'An unexpected error occurred. Please try again.'
  }
}

// Error reporting for production
export function reportError(error: Error, context?: Record<string, unknown>) {
  logger.error('Error reported', error, context)
  
  // In production, send to error reporting service
  if (!import.meta.env.DEV) {
    // Example: Send to Sentry, LogRocket, or similar service
    // Sentry.captureException(error, { contexts: { custom: context } })
  }
}

// Rate limiting for error reporting to prevent spam
const errorReportingCache = new Map<string, number>()
const ERROR_REPORT_LIMIT = 5 // Max reports per error type per minute

export function shouldReportError(error: Error): boolean {
  const key = `${error.name}:${error.message}`
  const now = Date.now()
  const minute = Math.floor(now / 60000)
  const cacheKey = `${key}:${minute}`
  
  const count = errorReportingCache.get(cacheKey) || 0
  if (count >= ERROR_REPORT_LIMIT) {
    return false
  }
  
  errorReportingCache.set(cacheKey, count + 1)
  
  // Clean up old entries
  for (const [k] of errorReportingCache) {
    const entryMinute = parseInt(k.split(':').pop() || '0')
    if (now - (entryMinute * 60000) > 300000) { // 5 minutes old
      errorReportingCache.delete(k)
    }
  }
  
  return true
}

// Retry mechanism for failed operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === maxAttempts) {
        break
      }
      
      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
      
      logger.warn(`Operation failed, retrying (${attempt}/${maxAttempts})`, {
        error: lastError.message,
        nextAttemptIn: delay
      })
    }
  }
  
  throw lastError
}