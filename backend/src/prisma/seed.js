/**
 * Seed file — creates the 5 flat members from the CSV as users,
 * a default group, and sets up their membership windows.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create users
  const password = await bcrypt.hash('password123', 12);

  const usersData = [
    { email: 'aisha@example.com', username: 'aisha', displayName: 'Aisha' },
    { email: 'rohan@example.com', username: 'rohan', displayName: 'Rohan' },
    { email: 'priya@example.com', username: 'priya', displayName: 'Priya' },
    { email: 'meera@example.com', username: 'meera', displayName: 'Meera' },
    { email: 'sam@example.com',   username: 'sam',   displayName: 'Sam' },
    { email: 'dev@example.com',   username: 'dev',   displayName: 'Dev' },
  ];

  const users = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: password },
    });
    users[u.username] = user;
    console.log(`  ✓ User: ${user.displayName} (${user.id})`);
  }

  // Create group
  const group = await prisma.group.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Flat Expenses 2026' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Flat Expenses 2026',
      description: 'Shared flat expenses for Aisha, Rohan, Priya, Meera (Feb-Mar) and Sam (Apr+)',
      createdById: users['aisha'].id,
    },
  });
  console.log(`  ✓ Group: ${group.name} (${group.id})`);

  // Clear existing memberships for this group
  await prisma.groupMember.deleteMany({ where: { groupId: group.id } });

  // Membership windows based on CSV data
  const memberships = [
    { userId: users['aisha'].id, joinedAt: new Date('2026-02-01'), leftAt: null,       role: 'admin' },
    { userId: users['rohan'].id, joinedAt: new Date('2026-02-01'), leftAt: null,       role: 'member' },
    { userId: users['priya'].id, joinedAt: new Date('2026-02-01'), leftAt: null,       role: 'member' },
    { userId: users['meera'].id, joinedAt: new Date('2026-02-01'), leftAt: new Date('2026-03-31'), role: 'member' },
    { userId: users['sam'].id,   joinedAt: new Date('2026-04-10'), leftAt: null,       role: 'member' },
    { userId: users['dev'].id,   joinedAt: new Date('2026-03-08'), leftAt: new Date('2026-03-12'), role: 'member' },
  ];

  for (const m of memberships) {
    await prisma.groupMember.create({ data: { groupId: group.id, ...m } });
    const user = Object.values(users).find((u) => u.id === m.userId);
    console.log(`  ✓ Member: ${user.displayName} joined ${m.joinedAt.toISOString().split('T')[0]}${m.leftAt ? ' left ' + m.leftAt.toISOString().split('T')[0] : ''}`);
  }

  console.log('\n✅ Seed complete!');
  console.log('\n📋 Login credentials (all passwords: password123):');
  usersData.forEach((u) => console.log(`  ${u.displayName}: ${u.email}`));
  console.log(`\n📦 Group ID: ${group.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
