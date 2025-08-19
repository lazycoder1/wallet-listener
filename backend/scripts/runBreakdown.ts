import { BalanceService } from '../src/services/balance/balanceService';

async function main() {
    const address = process.argv[2] || '0xd0ab307DE17a7EC85498cD871365749285388998';
    const service = BalanceService.getInstance();
    const { totalUsd, rows, byNetwork } = await service.getAlchemyBreakdown(address);

    console.log('Address:', address);
    console.log('Total USD:', totalUsd.toFixed(2));
    console.log('By network:', byNetwork);
    console.log('Top contributors:');
    for (const r of [...rows].sort((a, b) => b.usdValue - a.usdValue).slice(0, 50)) {
        console.log(`${r.network} ${r.symbol} ${r.tokenAddress} amount=${r.tokenAmount} price=${r.usdPrice} usd=${r.usdValue}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });