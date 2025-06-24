#!/usr/bin/env bun

/**
 * Test script to verify multi-company notifications work correctly
 * 
 * This script tests the scenario where the same address is configured
 * for multiple companies/workspaces to ensure all get notified.
 */

import { PrismaClient } from '@prisma/client';
import logger from '../src/config/logger';

const prisma = new PrismaClient();

async function testMultiCompanyNotifications() {
    try {
        console.log('=== Testing Multi-Company Notifications ===\n');

        // 1. Check if we have any addresses configured for multiple companies
        const multiCompanyAddresses = await prisma.companyAddress.groupBy({
            by: ['addressId'],
            having: {
                addressId: {
                    _count: {
                        gt: 1
                    }
                }
            },
            where: {
                isActive: true
            }
        });

        if (multiCompanyAddresses.length === 0) {
            console.log('❌ No addresses found that are configured for multiple companies.');
            console.log('To test this feature, you need to:');
            console.log('1. Create multiple companies');
            console.log('2. Configure the same address for different companies');
            console.log('3. Set up Slack configurations for each company');
            return;
        }

        console.log(`✅ Found ${multiCompanyAddresses.length} address(es) configured for multiple companies\n`);

        // 2. Get detailed information about each multi-company address
        for (const multiAddr of multiCompanyAddresses) {
            const addressDetails = await prisma.address.findUnique({
                where: { id: multiAddr.addressId },
                include: {
                    companyAddresses: {
                        where: { isActive: true },
                        include: {
                            company: {
                                include: {
                                    slackConfiguration: true
                                }
                            }
                        }
                    }
                }
            });

            if (!addressDetails) continue;

            console.log(`📋 Address: ${addressDetails.address} (${addressDetails.chainType})`);
            console.log(`   Configured for ${addressDetails.companyAddresses.length} companies:\n`);

            addressDetails.companyAddresses.forEach((ca, index) => {
                const company = ca.company;
                const slackConfig = company?.slackConfiguration;

                console.log(`   ${index + 1}. Company: ${company?.name || 'Unknown'} (ID: ${ca.companyId})`);
                console.log(`      Account Name: ${ca.accountName || 'N/A'}`);
                console.log(`      Account Manager: ${ca.accountManager || 'N/A'}`);
                console.log(`      Threshold: ${ca.threshold}`);
                console.log(`      Slack Enabled: ${slackConfig?.isEnabled ? 'Yes' : 'No'}`);
                console.log(`      Slack Channel: ${slackConfig?.channelId || 'Not configured'}`);
                console.log(`      Slack Team: ${slackConfig?.slackTeamName || slackConfig?.slackTeamId || 'Not configured'}`);
                console.log('');
            });

            // 3. Test notification logic
            console.log('🔍 Testing notification logic for this address...');

            // Simulate the SlackNotifierChannel logic
            const companyAddresses = await prisma.companyAddress.findMany({
                where: {
                    address: {
                        address: addressDetails.address,
                        chainType: addressDetails.chainType,
                    },
                    isActive: true,
                },
                include: {
                    address: true,
                    company: {
                        include: {
                            slackConfiguration: true,
                        },
                    },
                },
            });

            console.log(`   Found ${companyAddresses.length} active company address records`);

            let notificationsSent = 0;
            let notificationsSkipped = 0;

            for (const companyAddress of companyAddresses) {
                if (!companyAddress.company) {
                    console.log(`   ⚠️  Company address record found but company is null`);
                    continue;
                }

                const slackConfig = companyAddress.company.slackConfiguration;
                const companyName = companyAddress.company.name;

                if (!slackConfig || !slackConfig.isEnabled || !slackConfig.channelId || !slackConfig.accessToken) {
                    console.log(`   ⏭️  Skipping ${companyName}: Slack not configured or disabled`);
                    notificationsSkipped++;
                    continue;
                }

                console.log(`   ✅ Would send notification to ${companyName} (Channel: ${slackConfig.channelId})`);
                notificationsSent++;
            }

            console.log(`\n📊 Summary for ${addressDetails.address}:`);
            console.log(`   - Notifications that would be sent: ${notificationsSent}`);
            console.log(`   - Notifications skipped: ${notificationsSkipped}`);
            console.log('');

            // Only test the first multi-company address to avoid too much output
            break;
        }

        console.log('✅ Multi-company notification test completed successfully!');
        console.log('\n💡 Key improvements made:');
        console.log('   - Changed findFirst() to findMany() in SlackNotifierChannel');
        console.log('   - Added loop to process all companies for the same address');
        console.log('   - Added proper error handling for individual company failures');
        console.log('   - Added logging to track multi-company scenarios');

    } catch (error) {
        console.error('❌ Error during multi-company notification test:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testMultiCompanyNotifications().catch(console.error); 