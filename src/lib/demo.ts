import { db, Loan, Tx, addDays, Student } from './db';

// This function will be called once on app startup to ensure there's some data.
export async function seedInitialData() {
    const studentCount = await db.students.count();
    // Only seed if the database is empty
    if (studentCount > 0) {
        console.log("Database already has data. Skipping seed.");
        return;
    }

    console.log("Seeding initial database data...");

    // Create a few students
    const studentsToCreate: Student[] = [
        { index_number: 'STU-001', full_name: 'Alice Johnson', program: 'Computer Science', level: '300', phone: '555-0101', card_uid: 'CARD-ALICE', created_at: new Date().toISOString() },
        { index_number: 'STU-002', full_name: 'Bob Williams', program: 'Engineering', level: '200', phone: '555-0102', card_uid: 'CARD-BOB', created_at: new Date().toISOString() },
        { index_number: 'STU-003', full_name: 'Charlie Brown', program: 'Art', level: '100', phone: '555-0103', card_uid: 'CARD-CHARLIE', created_at: new Date().toISOString() },
    ];
    await db.students.bulkAdd(studentsToCreate);

    // Create a few loans
    const now = new Date();
    const loansToCreate: Loan[] = [
        // Active loan for Alice
        {
            id: crypto.randomUUID(),
            student_index: 'STU-001',
            user_uid: 'CARD-ALICE',
            item_tag: 'BOOK-CS101',
            item_title: 'Intro to Algorithms',
            borrowed_at: addDays(now.toISOString(), -10),
            due_at: addDays(now.toISOString(), 4), // Due soon
            returned_at: null,
            status: 'ACTIVE',
            device_id: 'web-kiosk-seed',
            synced: 0
        },
        // Overdue loan for Bob
        {
            id: crypto.randomUUID(),
            student_index: 'STU-002',
            user_uid: 'CARD-BOB',
            item_tag: 'BOOK-ENG202',
            item_title: 'Mechanics of Materials',
            borrowed_at: addDays(now.toISOString(), -20),
            due_at: addDays(now.toISOString(), -6), // Overdue
            returned_at: null,
            status: 'ACTIVE',
            device_id: 'web-kiosk-seed',
            synced: 0
        },
        // Returned loan for Alice
        {
            id: crypto.randomUUID(),
            student_index: 'STU-001',
            user_uid: 'CARD-ALICE',
            item_tag: 'BOOK-CS205',
            item_title: 'Data Structures',
            borrowed_at: addDays(now.toISOString(), -30),
            due_at: addDays(now.toISOString(), -16),
            returned_at: addDays(now.toISOString(), -15),
            status: 'RETURNED',
            device_id: 'web-kiosk-seed',
            synced: 0
        },
    ];
    await db.loans.bulkAdd(loansToCreate);

    // Create corresponding transactions
    const txsToCreate: Tx[] = [
        {
            id: crypto.randomUUID(),
            user_uid: 'CARD-ALICE',
            student_index: 'STU-001',
            item_tag: 'BOOK-CS101',
            action: 'BORROW',
            occurred_at: addDays(now.toISOString(), -10),
            device_id: 'web-kiosk-seed',
            synced: 0
        },
        {
            id: crypto.randomUUID(),
            user_uid: 'CARD-BOB',
            student_index: 'STU-002',
            item_tag: 'BOOK-ENG202',
            action: 'BORROW',
            occurred_at: addDays(now.toISOString(), -20),
            device_id: 'web-kiosk-seed',
            synced: 0
        },
        {
            id: crypto.randomUUID(),
            user_uid: 'CARD-ALICE',
            student_index: 'STU-001',
            item_tag: 'BOOK-CS205',
            action: 'BORROW',
            occurred_at: addDays(now.toISOString(), -30),
            device_id: 'web-kiosk-seed',
            synced: 0
        },
        {
            id: crypto.randomUUID(),
            user_uid: 'CARD-ALICE',
            student_index: 'STU-001',
            item_tag: 'BOOK-CS205',
            action: 'RETURN',
            occurred_at: addDays(now.toISOString(), -15),
            device_id: 'web-kiosk-seed',
            synced: 0
        }
    ];
    await db.transactions.bulkAdd(txsToCreate);

    console.log("Database seeded successfully.");
}
