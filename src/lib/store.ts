import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Student, Loan, Tx } from './db'
import { User } from './auth'

// UI State
interface UIState {
  theme: 'light' | 'dark' | 'auto'
  sidebarCollapsed: boolean
  notifications: Notification[]
  loading: Record<string, boolean>
  errors: Record<string, string>
}

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: string
  read: boolean
  persistent?: boolean
}

// Auth State
interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  sessionExpiry: string | null
}

// App Data State
interface AppState {
  students: Student[]
  loans: Loan[]
  transactions: Tx[]
  stats: {
    total: number
    today: number
    unsynced: number
    borrowed: number
    returned: number
  }
  lastUpdate: string | null
}

// Serial/Device State
interface DeviceState {
  connected: boolean
  port: SerialPort | null
  status: Record<string, unknown> | null
  lastScannedUID: string
  log: string[]
}

// Combined Store Interface
interface AppStore extends UIState, AuthState, AppState, DeviceState {
  // UI Actions
  setTheme: (theme: UIState['theme']) => void
  toggleSidebar: () => void
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  setLoading: (key: string, loading: boolean) => void
  setError: (key: string, error: string | null) => void
  clearErrors: () => void

  // Auth Actions
  setAuth: (user: User, token: string, expiresAt: string) => void
  clearAuth: () => void
  updateUser: (user: Partial<User>) => void

  // Data Actions
  setStudents: (students: Student[]) => void
  addStudent: (student: Student) => void
  updateStudent: (id: number, updates: Partial<Student>) => void
  removeStudent: (id: number) => void
  
  setLoans: (loans: Loan[]) => void
  addLoan: (loan: Loan) => void
  updateLoan: (id: string, updates: Partial<Loan>) => void
  
  setTransactions: (transactions: Tx[]) => void
  addTransaction: (transaction: Tx) => void
  
  updateStats: (stats: Partial<AppState['stats']>) => void
  
  // Device Actions
  setDeviceConnection: (connected: boolean, port?: SerialPort | null) => void
  setDeviceStatus: (status: Record<string, unknown>) => void
  setLastScannedUID: (uid: string) => void
  addLogEntry: (entry: string) => void
  clearLog: () => void

  // Combined Actions
  refreshData: () => Promise<void>
  reset: () => void
}

// Initial state values
const initialUIState: UIState = {
  theme: 'auto',
  sidebarCollapsed: false,
  notifications: [],
  loading: {},
  errors: {},
}

const initialAuthState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  sessionExpiry: null,
}

const initialAppState: AppState = {
  students: [],
  loans: [],
  transactions: [],
  stats: {
    total: 0,
    today: 0,
    unsynced: 0,
    borrowed: 0,
    returned: 0,
  },
  lastUpdate: null,
}

const initialDeviceState: DeviceState = {
  connected: false,
  port: null,
  status: null,
  lastScannedUID: '',
  log: [],
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial State
      ...initialUIState,
      ...initialAuthState,
      ...initialAppState,
      ...initialDeviceState,

      // UI Actions
      setTheme: (theme) => set({ theme }),
      
      toggleSidebar: () => set((state) => ({ 
        sidebarCollapsed: !state.sidebarCollapsed 
      })),
      
      addNotification: (notification) => set((state) => ({
        notifications: [
          {
            ...notification,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            read: false,
          },
          ...state.notifications,
        ].slice(0, 50), // Keep only latest 50 notifications
      })),
      
      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, read: true } : n
        ),
      })),
      
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id),
      })),
      
      clearNotifications: () => set({ notifications: [] }),
      
      setLoading: (key, loading) => set((state) => ({
        loading: { ...state.loading, [key]: loading },
      })),
      
      setError: (key, error) => set((state) => ({
        errors: error ? { ...state.errors, [key]: error } : 
                       Object.fromEntries(Object.entries(state.errors).filter(([k]) => k !== key)),
      })),
      
      clearErrors: () => set({ errors: {} }),

      // Auth Actions
      setAuth: (user, token, expiresAt) => set({
        user,
        token,
        isAuthenticated: true,
        sessionExpiry: expiresAt,
      }),
      
      clearAuth: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        sessionExpiry: null,
      }),
      
      updateUser: (userUpdates) => set((state) => ({
        user: state.user ? { ...state.user, ...userUpdates } : null,
      })),

      // Data Actions
      setStudents: (students) => set({ 
        students, 
        lastUpdate: new Date().toISOString() 
      }),
      
      addStudent: (student) => set((state) => ({
        students: [...state.students, student],
        lastUpdate: new Date().toISOString(),
      })),
      
      updateStudent: (id, updates) => set((state) => ({
        students: state.students.map(s => s.id === id ? { ...s, ...updates } : s),
        lastUpdate: new Date().toISOString(),
      })),
      
      removeStudent: (id) => set((state) => ({
        students: state.students.filter(s => s.id !== id),
        lastUpdate: new Date().toISOString(),
      })),
      
      setLoans: (loans) => set({ 
        loans, 
        lastUpdate: new Date().toISOString() 
      }),
      
      addLoan: (loan) => set((state) => ({
        loans: [loan, ...state.loans],
        lastUpdate: new Date().toISOString(),
      })),
      
      updateLoan: (id, updates) => set((state) => ({
        loans: state.loans.map(l => l.id === id ? { ...l, ...updates } : l),
        lastUpdate: new Date().toISOString(),
      })),
      
      setTransactions: (transactions) => set({ 
        transactions, 
        lastUpdate: new Date().toISOString() 
      }),
      
      addTransaction: (transaction) => set((state) => ({
        transactions: [transaction, ...state.transactions.slice(0, 499)], // Keep latest 500
        lastUpdate: new Date().toISOString(),
      })),
      
      updateStats: (statsUpdates) => set((state) => ({
        stats: { ...state.stats, ...statsUpdates },
      })),

      // Device Actions
      setDeviceConnection: (connected, port) => set({ 
        connected, 
        port: port ?? null 
      }),
      
      setDeviceStatus: (status) => set({ status }),
      
      setLastScannedUID: (uid) => set({ lastScannedUID: uid }),
      
      addLogEntry: (entry) => set((state) => ({
        log: [
          `[${new Date().toLocaleTimeString()}] ${entry}`,
          ...state.log.slice(0, 99) // Keep latest 100 entries
        ],
      })),
      
      clearLog: () => set({ log: [] }),

      // Combined Actions
      refreshData: async () => {
        const { setLoading, setError, setStudents, setTransactions, updateStats } = get()
        
        try {
          setLoading('refresh', true)
          setError('refresh', null)
          
          // Import database functions
          const { db, stats } = await import('./db')
          
          // Fetch latest data
          const [students, transactions, currentStats] = await Promise.all([
            db.students.orderBy('created_at').reverse().toArray(),
            db.transactions.orderBy('occurred_at').reverse().limit(500).toArray(),
            stats(),
          ])
          
          setStudents(students)
          setTransactions(transactions)
          updateStats(currentStats)
          
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to refresh data'
          setError('refresh', message)
        } finally {
          setLoading('refresh', false)
        }
      },
      
      reset: () => set({
        ...initialUIState,
        ...initialAuthState,
        ...initialAppState,
        ...initialDeviceState,
      }),
    }),
    {
      name: 'rfid-library-store',
      partialize: (state) => ({
        // Only persist certain parts of the state
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        sessionExpiry: state.sessionExpiry,
        // Don't persist device state or temporary data
      }),
    }
  )
)

// Selectors for common data
export const useStudents = () => useAppStore((state) => state.students)
export const useLoans = () => useAppStore((state) => state.loans)
export const useTransactions = () => useAppStore((state) => state.transactions)
export const useAuth = () => useAppStore((state) => ({
  user: state.user,
  token: state.token,
  isAuthenticated: state.isAuthenticated,
  sessionExpiry: state.sessionExpiry,
}))
export const useDevice = () => useAppStore((state) => ({
  connected: state.connected,
  status: state.status,
  lastScannedUID: state.lastScannedUID,
  log: state.log,
}))
export const useUI = () => useAppStore((state) => ({
  theme: state.theme,
  sidebarCollapsed: state.sidebarCollapsed,
  notifications: state.notifications,
  loading: state.loading,
  errors: state.errors,
}))

// Action hooks
export const useUIActions = () => useAppStore((state) => ({
  setTheme: state.setTheme,
  toggleSidebar: state.toggleSidebar,
  addNotification: state.addNotification,
  markNotificationRead: state.markNotificationRead,
  removeNotification: state.removeNotification,
  clearNotifications: state.clearNotifications,
  setLoading: state.setLoading,
  setError: state.setError,
  clearErrors: state.clearErrors,
}))

export const useAuthActions = () => useAppStore((state) => ({
  setAuth: state.setAuth,
  clearAuth: state.clearAuth,
  updateUser: state.updateUser,
}))

export const useDataActions = () => useAppStore((state) => ({
  setStudents: state.setStudents,
  addStudent: state.addStudent,
  updateStudent: state.updateStudent,
  removeStudent: state.removeStudent,
  setLoans: state.setLoans,
  addLoan: state.addLoan,
  updateLoan: state.updateLoan,
  setTransactions: state.setTransactions,
  addTransaction: state.addTransaction,
  updateStats: state.updateStats,
  refreshData: state.refreshData,
}))

export const useDeviceActions = () => useAppStore((state) => ({
  setDeviceConnection: state.setDeviceConnection,
  setDeviceStatus: state.setDeviceStatus,
  setLastScannedUID: state.setLastScannedUID,
  addLogEntry: state.addLogEntry,
  clearLog: state.clearLog,
}))