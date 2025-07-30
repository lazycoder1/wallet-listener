import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUsers() {
    try {
        console.log('👥 Listing all users in the database...\n');

        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: {
                        sessions: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (users.length === 0) {
            console.log('📭 No users found in the database');
            console.log('💡 Run: bun setup:admin or bun scripts/resetAndCreateUser.ts to create an admin user');
            return;
        }

        console.log(`📊 Found ${users.length} user(s):\n`);

        users.forEach((user, index) => {
            console.log(`${index + 1}. User Details:`);
            console.log(`   ID: ${user.id}`);
            console.log(`   Username: "${user.username}"`);
            console.log(`   Email: ${user.email}`);
            console.log(`   Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
            console.log(`   Created: ${user.createdAt.toISOString()}`);
            console.log(`   Last Login: ${user.lastLoginAt ? user.lastLoginAt.toISOString() : 'Never'}`);
            console.log(`   Active Sessions: ${user._count.sessions}`);
            console.log('');
        });

        console.log('🔐 To verify login credentials, use:');
        console.log('   bun scripts/verifyLogin.ts <username> <password>');

    } catch (error) {
        console.error('💥 Error listing users:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

listUsers();