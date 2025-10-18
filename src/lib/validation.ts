import Joi from 'joi'

// Validation schemas
export const schemas = {
  student: Joi.object({
    index_number: Joi.string()
      .trim()
      .min(3)
      .max(50)
      .pattern(/^[A-Z0-9\-_]+$/i)
      .required()
      .messages({
        'string.pattern.base': 'Index number must contain only letters, numbers, hyphens, and underscores',
        'string.min': 'Index number must be at least 3 characters long',
        'string.max': 'Index number must be at most 50 characters long',
      }),
    full_name: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s\-'.]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Full name must contain only letters, spaces, hyphens, and apostrophes',
        'string.min': 'Full name must be at least 2 characters long',
      }),
    program: Joi.string().trim().max(100).allow('', null),
    level: Joi.string().trim().max(50).allow('', null),
    phone: Joi.string()
      .trim()
      .pattern(/^[\+]?[\d\s\-()]{7,20}$/)
      .allow('', null)
      .messages({
        'string.pattern.base': 'Phone number format is invalid',
      }),
    card_uid: Joi.string()
      .trim()
      .min(4)
      .max(50)
      .pattern(/^[A-F0-9]+$/i)
      .allow('', null)
      .messages({
        'string.pattern.base': 'Card UID must contain only hexadecimal characters',
        'string.min': 'Card UID must be at least 4 characters long',
      }),
  }),

  loan: Joi.object({
    student_index: Joi.string().trim().min(3).max(50).required(),
    user_uid: Joi.string().trim().min(4).max(50).allow(null),
    item_tag: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .pattern(/^[A-Z0-9\-_./]+$/i)
      .required()
      .messages({
        'string.pattern.base': 'Item tag must contain only letters, numbers, hyphens, underscores, dots, and slashes',
      }),
    item_title: Joi.string().trim().max(200).allow('', null),
    days: Joi.number().integer().min(1).max(365).required(),
  }),

  transaction: Joi.object({
    user_uid: Joi.string().trim().allow(null),
    student_index: Joi.string().trim().allow(null),
    item_tag: Joi.string().trim().min(1).max(100).required(),
    action: Joi.string().valid('BORROW', 'RETURN').required(),
    device_id: Joi.string().trim().max(100).required(),
  }),

  search: Joi.object({
    query: Joi.string().trim().max(100).allow(''),
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0),
  }),
}

// Validation helpers
export function validateInput<T>(data: unknown, schema: Joi.ObjectSchema): {
  valid: boolean
  data?: T
  errors?: string[]
} {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  })

  if (error) {
    return {
      valid: false,
      errors: error.details.map(detail => detail.message),
    }
  }

  return {
    valid: true,
    data: value as T,
  }
}

// Sanitization utilities
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

export function sanitizeForDatabase(input: string): string {
  // Remove potentially dangerous characters for database queries
  return input.replace(/[<>'"&]/g, '').trim()
}

// UID validation and formatting
export function validateAndFormatUID(uid: string): { valid: boolean; formatted?: string; error?: string } {
  if (!uid || typeof uid !== 'string') {
    return { valid: false, error: 'UID is required and must be a string' }
  }

  // Remove common separators and whitespace
  const cleaned = uid.replace(/[\s\-:]/g, '').toUpperCase()
  
  // Check if it's a valid hex string
  if (!/^[A-F0-9]+$/.test(cleaned)) {
    return { valid: false, error: 'UID must contain only hexadecimal characters' }
  }

  // Check length (typical RFID UIDs are 8-20 characters)
  if (cleaned.length < 4 || cleaned.length > 20) {
    return { valid: false, error: 'UID must be between 4 and 20 characters long' }
  }

  return { valid: true, formatted: cleaned }
}

// File validation for imports
export function validateImportFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    return { valid: false, error: 'File must be a JSON file' }
  }

  // Check file size (max 50MB)
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, error: 'File size must be less than 50MB' }
  }

  return { valid: true }
}

// Serial command validation
export function validateSerialCommand(command: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required and must be a string' }
  }

  const sanitized = command.trim().toUpperCase()
  
  // Only allow specific commands
  const allowedCommands = [
    'STATUS', 'SCAN', 'SMS ON', 'SMS OFF', 'AUTO ON', 'AUTO OFF',
    'REMIND ALL', 'SET STUDENT', 'BORROW', 'RETURN', 'REMIND ONE'
  ]
  
  const baseCommand = sanitized.split(' ')[0]
  const isAllowed = allowedCommands.some(cmd => 
    sanitized.startsWith(cmd) || baseCommand === cmd.split(' ')[0]
  )
  
  if (!isAllowed) {
    return { valid: false, error: 'Command not allowed' }
  }

  // Prevent injection attacks
  if (sanitized.includes(';') || sanitized.includes('&&') || sanitized.includes('||')) {
    return { valid: false, error: 'Invalid characters in command' }
  }

  return { valid: true, sanitized }
}

// Date validation and formatting
export function validateDateRange(startDate: string, endDate: string): {
  valid: boolean
  error?: string
  formatted?: { start: Date; end: Date }
} {
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { valid: false, error: 'Invalid date format' }
    }
    
    if (start > end) {
      return { valid: false, error: 'Start date must be before end date' }
    }
    
    // Prevent unreasonably large date ranges (more than 5 years)
    const maxRange = 5 * 365 * 24 * 60 * 60 * 1000
    if (end.getTime() - start.getTime() > maxRange) {
      return { valid: false, error: 'Date range cannot exceed 5 years' }
    }
    
    return { valid: true, formatted: { start, end } }
  } catch (error) {
    return { valid: false, error: 'Invalid date format' }
  }
}

// Bulk operation validation
export function validateBulkOperation(items: unknown[], maxItems: number = 1000): {
  valid: boolean
  error?: string
} {
  if (!Array.isArray(items)) {
    return { valid: false, error: 'Input must be an array' }
  }
  
  if (items.length === 0) {
    return { valid: false, error: 'At least one item is required' }
  }
  
  if (items.length > maxItems) {
    return { valid: false, error: `Cannot process more than ${maxItems} items at once` }
  }
  
  return { valid: true }
}