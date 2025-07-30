import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function verifyLogin(username: string, password: string) {
    try {
        console.log(`🔍 Verifying login for username: "${username}"`);
        console.log(`🔍 Password provided: "${password}"`);
        console.log('─'.repeat(50));

        // Find user by username
        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                email: true,
                passwordHash: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true
            }
        });

        if (!user) {
            console.log('❌ USER NOT FOUND');
            console.log('Available users:');

            const allUsers = await prisma.user.findMany({
                select: {
                    id: true,
                    username: true,
                    email: true,
                    isActive: true,
                    createdAt: true
                }
            });

            if (allUsers.length === 0) {
                console.log('   No users found in database');
            } else {
                allUsers.forEach(u => {
                    console.log(`   - ID: ${u.id}, Username: "${u.username}", Email: ${u.email}, Active: ${u.isActive}`);
                });
            }
            return false;
        }

        console.log('✅ USER FOUND:');
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Username: "${user.username}"`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Active: ${user.isActive}`);
        console.log(`   - Created: ${user.createdAt}`);
        console.log(`   - Last Login: ${user.lastLoginAt || 'Never'}`);
        console.log(`   - Password Hash: ${user.passwordHash.substring(0, 20)}...`);

        if (!user.isActive) {
            console.log('❌ USER IS INACTIVE');
            return false;
        }

        // Verify password
        console.log('\n🔐 Verifying password...');
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (isPasswordValid) {
            console.log('✅ PASSWORD CORRECT');
            console.log('🎉 Authentication would succeed!');
            return true;
        } else {
            console.log('❌ PASSWORD INCORRECT');
            console.log('💡 The password hash does not match the provided password');
            return false;
        }

    } catch (error) {
        console.error('💥 Error during verification:', error);
        return false;
    } finally {
        await prisma.$disconnect();
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length !== 2) {
        console.log('❌ Usage: bun scripts/verifyLogin.ts <username> <password>');
        console.log('📝 Example: bun scripts/verifyLogin.ts WalletShark "SharkWall@123!"');
        process.exit(1);
    }

    const [username, password] = args;

    console.log('🚀 Starting login verification...\n');
    const result = await verifyLogin(username, password);

    console.log('\n' + '='.repeat(50));
    console.log(result ? '🎯 RESULT: Authentication SUCCESS' : '💀 RESULT: Authentication FAILED');
    process.exit(result ? 0 : 1);
}

main();