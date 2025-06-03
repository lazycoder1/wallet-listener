import * as dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

/**
 * Script to debug Tron address linking in the database for Slack notifications using Prisma.
 *
 * Instructions:
 * 1. Ensure DATABASE_URL in .env is set correctly.
 * 2. Ensure Prisma Client is generated: bunx prisma generate (or npx prisma generate)
 * 3. Run the script from the 'backend' directory:
 *    bun run scripts/debug_address_linking_ts.ts <TRON_ADDRESS_TO_CHECK>
 *    Example: bun run scripts/debug_address_linking_ts.ts TNBefRhnjMFrwGBcuogZfn8mDaVTCajNK3
 */
import { PrismaClient, Address, CompanyAddress, Company } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'], // Keep Prisma logging verbose
});

// Define a more specific type for the elements in companyLinks for clarity
// This type should match what Prisma returns from the findMany query with the include
type CompanyLinkWithCompany = CompanyAddress & {
    company: Company | null;
};

async function main() {
    const targetAddress = process.argv[2];

    if (!targetAddress) {
        console.error("Usage: bun run scripts/debug_address_linking_ts.ts <TRON_ADDRESS_TO_CHECK>");
        console.error("Example: bun run scripts/debug_address_linking_ts.ts TNBefRhnjMFrwGBcuogZfn8mDaVTCajNK3");
        process.exit(1);
    }

    console.log(`--- Debugging Address Linking for: ${targetAddress} ---\n`);
    if (process.env.DATABASE_URL) {
        console.log(`[LOG] DATABASE_URL from env: ${process.env.DATABASE_URL}`);
    } else {
        console.log("[LOG] DATABASE_URL from env: NOT Loaded or Empty");
    }
    console.log(`[LOG] Current working directory: ${process.cwd()}`);
    console.log(`[LOG] NODE_ENV: ${process.env.NODE_ENV}`);


    let addressRecordExact: Address | null = null;
    try {
        // 1. Check 'addresses' table (exact case)
        console.log(`[LOG] 1. Attempting to check 'addresses' table for '${targetAddress}' (exact case)...`);
        try {
            addressRecordExact = await prisma.address.findUnique({
                where: { address: targetAddress },
            });
            console.log("[LOG] 1. Finished checking 'addresses' table (exact case).");
        } catch (dbError) {
            console.error("[DB_ERROR] Failed during prisma.address.findUnique (exact case):", dbError);
            // Optionally re-throw or handle as needed, for now, we'll let the script continue to the finally block or broader catch
            throw dbError; // Re-throw to be caught by the outer try-catch for consistent error handling
        }

        let addressIdInDb: number | null = null;
        let foundCase: string | null = null;

        if (addressRecordExact) {
            console.log(`   FOUND (exact case):`);
            console.log(JSON.stringify(addressRecordExact, null, 2));
            addressIdInDb = addressRecordExact.id;
            foundCase = 'exact';
        } else {
            console.log(`   NOT FOUND (exact case).`);
        }

        // 1b. Check 'addresses' table (lowercase), only if exact case not found or to show if both exist
        const targetAddressLower = targetAddress.toLowerCase();
        console.log(`\n[LOG] 1b. Attempting to check 'addresses' table for '${targetAddressLower}' (lowercase)...`);
        const addressRecordLower: Address | null = await prisma.address.findUnique({
            where: { address: targetAddressLower },
        });
        console.log("[LOG] 1b. Finished checking 'addresses' table (lowercase).");

        if (addressRecordLower) {
            console.log(`   FOUND (lowercase):`);
            console.log(JSON.stringify(addressRecordLower, null, 2));
            if (!addressIdInDb) {
                addressIdInDb = addressRecordLower.id;
                foundCase = 'lowercase';
            }
        } else {
            console.log(`   NOT FOUND (lowercase).`);
        }

        if (!addressIdInDb) {
            console.log(`\nAddress '${targetAddress}' (nor its lowercase) not found in 'addresses' table. Stopping.`);
            return;
        }

        const actualFoundRecord = addressRecordExact?.address === targetAddress ? addressRecordExact : addressRecordLower;
        console.log(`\n   Using address_id: ${addressIdInDb} (derived from ${foundCase} match: '${actualFoundRecord?.address}') for further checks.`);

        // 2. Check 'company_addresses' table for linking
        console.log(`\n[LOG] 2. Attempting to check 'company_addresses' for linking with address_id: ${addressIdInDb}...`);
        const companyLinks: CompanyLinkWithCompany[] = await prisma.companyAddress.findMany({
            where: { address_id: addressIdInDb },
            include: { company: true }
        });
        console.log("[LOG] 2. Finished checking 'company_addresses'.");

        if (!companyLinks || companyLinks.length === 0) {
            console.log(`   NOT FOUND: No link in 'company_addresses' for address_id ${addressIdInDb}.`);
            console.log("   This is likely why the company is not found for Slack notifications.");
            return;
        }

        console.log(`   FOUND link(s) in 'company_addresses':`);
        console.log(JSON.stringify(companyLinks, null, 2));

        const activeLinks = companyLinks.filter((link: CompanyLinkWithCompany) => link.is_active === true);

        if (activeLinks.length === 0) {
            console.warn(`   WARNING: Link(s) found, but NO ACTIVE link (is_active=true) for address_id ${addressIdInDb}.`);
            console.warn("   This could also be why the company is not found for notifications.");
        }

        const companyIds = [...new Set(companyLinks.map((link: CompanyLinkWithCompany) => link.company_id))];

        if (companyIds.length > 0) {
            console.log(`\n3. Details for linked company/companies (IDs: ${companyIds.join(', ')}):`);
            companyLinks.forEach((link: CompanyLinkWithCompany) => {
                if (link.company) {
                    console.log(`   Company ID: ${link.company_id} (from company_address_id: ${link.id}, active: ${link.is_active})`);
                    console.log(JSON.stringify(link.company, null, 2));
                } else {
                    console.log(`   Company ID: ${link.company_id} - full details not pre-fetched or no company linked.`);
                }
            });
        } else {
            console.log("   No company_id found in the links to query the 'companies' table directly (should have been included).");
        }

        console.log("\n--- Debugging Complete ---");

    } catch (e) {
        console.error("Error during script execution:", e); // This should catch errors from anywhere in the try block
    } finally {
        console.log("[LOG] Attempting to disconnect Prisma Client...");
        await prisma.$disconnect();
        console.log("[LOG] Prisma Client disconnected.");
        console.log("\nDatabase connection closed.");
    }
}

main().catch(e => {
    console.error("Unhandled error in main:", e); // This catches errors if main() itself rejects or an error is re-thrown from main's catch
    console.log("[LOG] Attempting to disconnect Prisma Client due to unhandled error in main...");
    prisma.$disconnect().finally(() => {
        console.log("[LOG] Prisma Client disconnected following unhandled error.");
        process.exit(1);
    });
});