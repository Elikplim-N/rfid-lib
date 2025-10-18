import { describe, it, expect } from 'vitest'
import {
  validateInput,
  schemas,
  validateAndFormatUID,
  validateSerialCommand,
  validateDateRange,
  validateBulkOperation,
  validateImportFile,
} from '../validation'

describe('Validation', () => {
  describe('validateInput', () => {
    it('validates student data correctly', () => {
      const validStudent = {
        index_number: 'STU001',
        full_name: 'John Doe',
        program: 'Computer Science',
        level: 'Graduate',
        phone: '+1-234-567-8900',
        card_uid: 'ABCD1234',
      }

      const result = validateInput(validStudent, schemas.student)
      expect(result.valid).toBe(true)
      expect(result.data).toEqual(validStudent)
    })

    it('rejects invalid student data', () => {
      const invalidStudent = {
        index_number: 'ST', // Too short
        full_name: '123', // Contains numbers
        phone: 'invalid-phone',
        card_uid: 'xyz123', // Not hex
      }

      const result = validateInput(invalidStudent, schemas.student)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.length).toBeGreaterThan(0)
    })

    it('validates loan data correctly', () => {
      const validLoan = {
        student_index: 'STU001',
        user_uid: 'ABCD1234',
        item_tag: 'BOOK-001',
        item_title: 'Sample Book',
        days: 14,
      }

      const result = validateInput(validLoan, schemas.loan)
      expect(result.valid).toBe(true)
    })
  })

  describe('validateAndFormatUID', () => {
    it('formats valid UID correctly', () => {
      const result = validateAndFormatUID('ab-cd:12 34')
      expect(result.valid).toBe(true)
      expect(result.formatted).toBe('ABCD1234')
    })

    it('rejects invalid UIDs', () => {
      const result = validateAndFormatUID('xyz123')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('hexadecimal')
    })

    it('rejects UIDs that are too short or too long', () => {
      const tooShort = validateAndFormatUID('AB')
      expect(tooShort.valid).toBe(false)

      const tooLong = validateAndFormatUID('A'.repeat(25))
      expect(tooLong.valid).toBe(false)
    })
  })

  describe('validateSerialCommand', () => {
    it('validates allowed commands', () => {
      const commands = ['STATUS', 'SCAN', 'SMS ON', 'SMS OFF', 'AUTO ON 180', 'REMIND ALL']
      
      commands.forEach(cmd => {
        const result = validateSerialCommand(cmd)
        expect(result.valid).toBe(true)
        expect(result.sanitized).toBe(cmd.toUpperCase())
      })
    })

    it('rejects disallowed commands', () => {
      const result = validateSerialCommand('DELETE ALL')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not allowed')
    })

    it('rejects commands with injection attempts', () => {
      const result = validateSerialCommand('STATUS; rm -rf /')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid characters')
    })
  })

  describe('validateDateRange', () => {
    it('validates correct date range', () => {
      const start = '2023-01-01'
      const end = '2023-12-31'
      
      const result = validateDateRange(start, end)
      expect(result.valid).toBe(true)
      expect(result.formatted).toBeDefined()
    })

    it('rejects invalid date formats', () => {
      const result = validateDateRange('invalid-date', '2023-12-31')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid date format')
    })

    it('rejects ranges where start > end', () => {
      const result = validateDateRange('2023-12-31', '2023-01-01')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Start date must be before end date')
    })
  })

  describe('validateBulkOperation', () => {
    it('validates correct bulk operation', () => {
      const items = [1, 2, 3, 4, 5]
      const result = validateBulkOperation(items)
      expect(result.valid).toBe(true)
    })

    it('rejects empty arrays', () => {
      const result = validateBulkOperation([])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('At least one item is required')
    })

    it('rejects non-arrays', () => {
      const result = validateBulkOperation('not an array' as any)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Input must be an array')
    })

    it('rejects arrays that are too large', () => {
      const items = new Array(1001).fill(1)
      const result = validateBulkOperation(items)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Cannot process more than 1000 items')
    })
  })

  describe('validateImportFile', () => {
    it('validates JSON files', () => {
      const file = new File(['{}'], 'test.json', { type: 'application/json' })
      const result = validateImportFile(file)
      expect(result.valid).toBe(true)
    })

    it('rejects non-JSON files', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const result = validateImportFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be a JSON file')
    })

    it('rejects files that are too large', () => {
      const largeContent = 'x'.repeat(51 * 1024 * 1024) // 51MB
      const file = new File([largeContent], 'large.json', { type: 'application/json' })
      const result = validateImportFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('File size must be less than 50MB')
    })
  })
})