import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAndCreateUser() {
    try {
        // Clear existing users and sessions
        console.log('Clearing existing users and sessions...');
        await prisma.session.deleteMany({});
        await prisma.user.deleteMany({});

        // New credentials
        const username = process.env.INITIAL_ADMIN_USERNAME || 'WalletShark';
        const password = process.env.INITIAL_ADMIN_PASSWORD || 'SharkWall@123!';
        const email = process.env.INITIAL_ADMIN_EMAIL || 'shark@walletshark.io';

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create initial user
        const user = await prisma.user.create({
            data: {
                username,
                email,
                passwordHash,
                isActive: true
            },
            select: {
                id: true,
                username: true,
                email: true,
                createdAt: true
            }
        });

        console.log('✅ Admin user created successfully:');
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Password: ${password}`);
        console.log('\n🎯 You can now login with these credentials!');
    } catch (error) {
        console.error('❌ Error creating user:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

resetAndCreateUser();