import { BalanceService } from '../src/services/balance/balanceService';
import { prisma } from '../src/prisma';

async function main() {
    const address = process.argv[2];
    if (!address) {
        console.error('Usage: bun run backend/scripts/runBreakdownTracked.ts <EVM_ADDRESS>');
        process.exit(1);
    }

    const service = BalanceService.getInstance();
    const { totalUsd, rows, byNetwork } = await service.getAlchemyBreakdownTracked(address);

    console.log('Address:', address);
    console.log('Total USD (DB-tracked only):', totalUsd.toFixed(2));
    console.log('By network:', byNetwork);
    console.log('Top contributors:');
    for (const r of [...rows].sort((a, b) => b.usdValue - a.usdValue).slice(0, 50)) {
        console.log(`${r.network} ${r.symbol} ${r.tokenAddress} amount=${r.tokenAmount} price=${r.usdPrice} usd=${r.usdValue}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        try { await prisma.$disconnect(); } catch { }
    });


