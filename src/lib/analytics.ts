import { differenceInDays, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { db, Student, Loan, Tx } from './db'

// Analytics interfaces
export interface LibraryStats {
  overview: {
    totalStudents: number
    totalBooks: number
    activeLoans: number
    overdueLoans: number
    totalTransactions: number
    averageLoanDuration: number
  }
  trends: {
    loansThisWeek: number
    loansLastWeek: number
    returnsThisWeek: number
    returnsLastWeek: number
    newStudentsThisMonth: number
  }
  topStats: {
    mostBorrowedBooks: Array<{ item_tag: string; title?: string; count: number }>
    mostActiveStudents: Array<{ student: Student; loanCount: number }>
    overdueStudents: Array<{ student: Student; overdueCount: number; totalDays: number }>
  }
  timeAnalysis: {
    hourlyDistribution: Array<{ hour: number; borrowCount: number; returnCount: number }>
    weeklyDistribution: Array<{ day: string; borrowCount: number; returnCount: number }>
    monthlyTrends: Array<{ month: string; borrowCount: number; returnCount: number }>
  }
}

export interface BookReservation {
  id: string
  studentId: number
  itemTag: string
  itemTitle?: string
  reservedAt: string
  expiresAt: string
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED'
  notificationsSent: number
  priority: number // Higher priority for premium users, etc.
}

export interface Fine {
  id: string
  studentId: number
  loanId: string
  itemTag: string
  type: 'OVERDUE' | 'DAMAGE' | 'LOST' | 'OTHER'
  amount: number
  currency: string
  description: string
  issuedAt: string
  dueAt: string
  paidAt?: string
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'PARTIAL'
  paidAmount?: number
  waivedBy?: string
  waivedReason?: string
}

// Analytics functions
export async function generateLibraryStats(): Promise<LibraryStats> {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = endOfWeek(now)
  const lastWeekStart = startOfWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const lastWeekEnd = endOfWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const monthStart = startOfMonth(now)

  // Get all data
  const [students, loans, transactions] = await Promise.all([
    db.students.toArray(),
    db.loans.toArray(),
    db.transactions.toArray(),
  ])

  // Overview calculations
  const activeLoans = loans.filter(l => l.status === 'ACTIVE')
  const overdueLoans = activeLoans.filter(l => new Date(l.due_at) < now)
  const completedLoans = loans.filter(l => l.status === 'RETURNED')
  
  const totalLoanDays = completedLoans.reduce((sum, loan) => {
    if (loan.returned_at) {
      return sum + differenceInDays(new Date(loan.returned_at), new Date(loan.borrowed_at))
    }
    return sum
  }, 0)
  
  const averageLoanDuration = completedLoans.length > 0 ? totalLoanDays / completedLoans.length : 0

  // Unique books count (approximate from transactions)
  const uniqueBooks = new Set(transactions.map(t => t.item_tag)).size

  // Trends
  const thisWeekTransactions = transactions.filter(t => {
    const date = new Date(t.occurred_at)
    return date >= weekStart && date <= weekEnd
  })
  
  const lastWeekTransactions = transactions.filter(t => {
    const date = new Date(t.occurred_at)
    return date >= lastWeekStart && date <= lastWeekEnd
  })

  const loansThisWeek = thisWeekTransactions.filter(t => t.action === 'BORROW').length
  const loansLastWeek = lastWeekTransactions.filter(t => t.action === 'BORROW').length
  const returnsThisWeek = thisWeekTransactions.filter(t => t.action === 'RETURN').length
  const returnsLastWeek = lastWeekTransactions.filter(t => t.action === 'RETURN').length

  const newStudentsThisMonth = students.filter(s => 
    s.created_at && new Date(s.created_at) >= monthStart
  ).length

  // Top stats
  const bookStats = new Map<string, { count: number; title?: string }>()
  loans.forEach(loan => {
    const key = loan.item_tag
    const current = bookStats.get(key) || { count: 0, title: loan.item_title || undefined }
    bookStats.set(key, { 
      count: current.count + 1, 
      title: current.title || loan.item_title || undefined 
    })
  })

  const mostBorrowedBooks = Array.from(bookStats.entries())
    .map(([item_tag, data]) => ({ item_tag, title: data.title, count: data.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Student activity
  const studentActivity = new Map<number, number>()
  loans.forEach(loan => {
    if (loan.student_index) {
      const student = students.find(s => s.index_number === loan.student_index)
      if (student?.id) {
        studentActivity.set(student.id, (studentActivity.get(student.id) || 0) + 1)
      }
    }
  })

  const mostActiveStudents = Array.from(studentActivity.entries())
    .map(([studentId, loanCount]) => ({
      student: students.find(s => s.id === studentId)!,
      loanCount
    }))
    .filter(item => item.student)
    .sort((a, b) => b.loanCount - a.loanCount)
    .slice(0, 10)

  // Overdue analysis
  const overdueStats = new Map<number, { count: number; totalDays: number }>()
  overdueLoans.forEach(loan => {
    if (loan.student_index) {
      const student = students.find(s => s.index_number === loan.student_index)
      if (student?.id) {
        const daysOverdue = differenceInDays(now, new Date(loan.due_at))
        const current = overdueStats.get(student.id) || { count: 0, totalDays: 0 }
        overdueStats.set(student.id, {
          count: current.count + 1,
          totalDays: current.totalDays + daysOverdue
        })
      }
    }
  })

  const overdueStudents = Array.from(overdueStats.entries())
    .map(([studentId, stats]) => ({
      student: students.find(s => s.id === studentId)!,
      overdueCount: stats.count,
      totalDays: stats.totalDays
    }))
    .filter(item => item.student)
    .sort((a, b) => b.overdueCount - a.overdueCount || b.totalDays - a.totalDays)
    .slice(0, 10)

  // Time analysis
  const hourlyStats = new Array(24).fill(0).map((_, hour) => ({
    hour,
    borrowCount: 0,
    returnCount: 0
  }))

  transactions.forEach(t => {
    const hour = new Date(t.occurred_at).getHours()
    if (t.action === 'BORROW') hourlyStats[hour].borrowCount++
    if (t.action === 'RETURN') hourlyStats[hour].returnCount++
  })

  const weeklyStats = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(day => ({ day, borrowCount: 0, returnCount: 0 }))

  transactions.forEach(t => {
    const dayIndex = (new Date(t.occurred_at).getDay() + 6) % 7 // Monday = 0
    if (t.action === 'BORROW') weeklyStats[dayIndex].borrowCount++
    if (t.action === 'RETURN') weeklyStats[dayIndex].returnCount++
  })

  // Monthly trends (last 12 months)
  const monthlyStats: Array<{ month: string; borrowCount: number; returnCount: number }> = []
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = startOfMonth(date)
    const monthEnd = endOfMonth(date)
    
    const monthTransactions = transactions.filter(t => {
      const txDate = new Date(t.occurred_at)
      return txDate >= monthStart && txDate <= monthEnd
    })

    monthlyStats.push({
      month: format(date, 'MMM yyyy'),
      borrowCount: monthTransactions.filter(t => t.action === 'BORROW').length,
      returnCount: monthTransactions.filter(t => t.action === 'RETURN').length
    })
  }

  return {
    overview: {
      totalStudents: students.length,
      totalBooks: uniqueBooks,
      activeLoans: activeLoans.length,
      overdueLoans: overdueLoans.length,
      totalTransactions: transactions.length,
      averageLoanDuration: Math.round(averageLoanDuration * 10) / 10
    },
    trends: {
      loansThisWeek,
      loansLastWeek,
      returnsThisWeek,
      returnsLastWeek,
      newStudentsThisMonth
    },
    topStats: {
      mostBorrowedBooks,
      mostActiveStudents,
      overdueStudents
    },
    timeAnalysis: {
      hourlyDistribution: hourlyStats,
      weeklyDistribution: weeklyStats,
      monthlyTrends: monthlyStats
    }
  }
}

// Reservation system
export class ReservationManager {
  private reservations: BookReservation[] = []

  async createReservation(
    studentId: number,
    itemTag: string,
    itemTitle?: string,
    daysToExpire: number = 7
  ): Promise<{ success: boolean; reservation?: BookReservation; error?: string }> {
    try {
      // Check if book is currently available
      const activeLoans = await db.loans.where({ item_tag: itemTag, status: 'ACTIVE' as const }).toArray()
      if (activeLoans.length === 0) {
        return { success: false, error: 'Book is currently available for immediate borrowing' }
      }

      // Check if student already has a reservation for this book
      const existingReservation = this.reservations.find(r => 
        r.studentId === studentId && 
        r.itemTag === itemTag && 
        r.status === 'ACTIVE'
      )
      
      if (existingReservation) {
        return { success: false, error: 'You already have an active reservation for this book' }
      }

      // Create reservation
      const reservation: BookReservation = {
        id: crypto.randomUUID(),
        studentId,
        itemTag,
        itemTitle,
        reservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + daysToExpire * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        notificationsSent: 0,
        priority: 1 // Could be based on user type, membership level, etc.
      }

      this.reservations.push(reservation)
      return { success: true, reservation }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create reservation' }
    }
  }

  async cancelReservation(reservationId: string): Promise<{ success: boolean; error?: string }> {
    const index = this.reservations.findIndex(r => r.id === reservationId)
    if (index === -1) {
      return { success: false, error: 'Reservation not found' }
    }

    this.reservations[index].status = 'CANCELLED'
    return { success: true }
  }

  async getStudentReservations(studentId: number): Promise<BookReservation[]> {
    return this.reservations.filter(r => 
      r.studentId === studentId && 
      ['ACTIVE', 'FULFILLED'].includes(r.status)
    )
  }

  async processBookReturn(itemTag: string): Promise<void> {
    // Find active reservations for this book
    const reservations = this.reservations
      .filter(r => r.itemTag === itemTag && r.status === 'ACTIVE')
      .sort((a, b) => {
        // Sort by priority first, then by reservation date
        if (a.priority !== b.priority) return b.priority - a.priority
        return new Date(a.reservedAt).getTime() - new Date(b.reservedAt).getTime()
      })

    if (reservations.length > 0) {
      // Notify the first person in line
      const topReservation = reservations[0]
      topReservation.status = 'FULFILLED'
      topReservation.notificationsSent++
      
      // In a real app, send notification here
      console.log(`Notify student ${topReservation.studentId}: Book ${itemTag} is now available!`)
    }
  }

  async cleanupExpiredReservations(): Promise<number> {
    const now = new Date()
    let cleaned = 0
    
    this.reservations.forEach(reservation => {
      if (reservation.status === 'ACTIVE' && new Date(reservation.expiresAt) < now) {
        reservation.status = 'EXPIRED'
        cleaned++
      }
    })
    
    return cleaned
  }

  getActiveReservations(): BookReservation[] {
    return this.reservations.filter(r => r.status === 'ACTIVE')
  }
}

// Fine management system
export class FineManager {
  private fines: Fine[] = []

  async calculateOverdueFines(): Promise<Fine[]> {
    const now = new Date()
    const activeLoans = await db.loans.where({ status: 'ACTIVE' as const }).toArray()
    const overdueLoans = activeLoans.filter(loan => new Date(loan.due_at) < now)
    
    const newFines: Fine[] = []
    
    for (const loan of overdueLoans) {
      // Check if fine already exists for this loan
      const existingFine = this.fines.find(f => 
        f.loanId === loan.id && 
        f.type === 'OVERDUE' && 
        f.status === 'PENDING'
      )
      
      if (!existingFine) {
        const student = await db.students.where('index_number').equals(loan.student_index || '').first()
        if (student) {
          const daysOverdue = differenceInDays(now, new Date(loan.due_at))
          const amount = Math.min(daysOverdue * 0.50, 25.00) // $0.50 per day, max $25
          
          const fine: Fine = {
            id: crypto.randomUUID(),
            studentId: student.id!,
            loanId: loan.id,
            itemTag: loan.item_tag,
            type: 'OVERDUE',
            amount,
            currency: 'USD',
            description: `Overdue fine for ${loan.item_title || loan.item_tag} (${daysOverdue} days)`,
            issuedAt: new Date().toISOString(),
            dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days to pay
            status: 'PENDING'
          }
          
          this.fines.push(fine)
          newFines.push(fine)
        }
      }
    }
    
    return newFines
  }

  async createManualFine(
    studentId: number,
    loanId: string,
    itemTag: string,
    type: Fine['type'],
    amount: number,
    description: string,
    daysToPayx: number = 30
  ): Promise<{ success: boolean; fine?: Fine; error?: string }> {
    try {
      const fine: Fine = {
        id: crypto.randomUUID(),
        studentId,
        loanId,
        itemTag,
        type,
        amount,
        currency: 'USD',
        description,
        issuedAt: new Date().toISOString(),
        dueAt: new Date(Date.now() + daysToPayx * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING'
      }
      
      this.fines.push(fine)
      return { success: true, fine }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create fine' }
    }
  }

  async payFine(fineId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const fine = this.fines.find(f => f.id === fineId)
    if (!fine) {
      return { success: false, error: 'Fine not found' }
    }

    if (fine.status === 'PAID') {
      return { success: false, error: 'Fine is already paid' }
    }

    const paidAmount = (fine.paidAmount || 0) + amount
    
    if (paidAmount >= fine.amount) {
      fine.status = 'PAID'
      fine.paidAmount = fine.amount
      fine.paidAt = new Date().toISOString()
    } else {
      fine.status = 'PARTIAL'
      fine.paidAmount = paidAmount
    }
    
    return { success: true }
  }

  async waiveFine(fineId: string, reason: string, waivedBy: string): Promise<{ success: boolean; error?: string }> {
    const fine = this.fines.find(f => f.id === fineId)
    if (!fine) {
      return { success: false, error: 'Fine not found' }
    }

    fine.status = 'WAIVED'
    fine.waivedBy = waivedBy
    fine.waivedReason = reason
    fine.paidAt = new Date().toISOString()
    
    return { success: true }
  }

  async getStudentFines(studentId: number): Promise<Fine[]> {
    return this.fines.filter(f => f.studentId === studentId)
  }

  async getUnpaidFines(): Promise<Fine[]> {
    return this.fines.filter(f => ['PENDING', 'PARTIAL'].includes(f.status))
  }

  getTotalFineAmount(fines: Fine[]): number {
    return fines
      .filter(f => f.status === 'PENDING' || f.status === 'PARTIAL')
      .reduce((total, fine) => total + fine.amount - (fine.paidAmount || 0), 0)
  }
}

// Export singleton instances
export const reservationManager = new ReservationManager()
export const fineManager = new FineManager()