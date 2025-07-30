import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createInitialUser() {
    try {
        // Check if any users exist
        const userCount = await prisma.user.count();

        if (userCount > 0) {
            console.log('Users already exist. Skipping initial user creation.');
            return;
        }

        // Default credentials
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

        console.log('Initial admin user created successfully:');
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Password: ${password}`);
        console.log('\n⚠️  IMPORTANT: Change the default password after first login!');
    } catch (error) {
        console.error('Error creating initial user:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

createInitialUser();