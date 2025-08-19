import axios from 'axios';
import { config as appConfig } from '../src/config';

type BalanceEntry = {
    network: string;
    address: string;
    tokenAddress: string | null;
    tokenBalance: string;
    tokenMetadata?: Record<string, any>;
    tokenPrices?: Array<Record<string, any>>;
    [key: string]: any;
};

async function main() {
    const [evmAddress, ...rest] = process.argv.slice(2);
    const tokenFilterArg = rest.find((a) => a.startsWith('--token='));
    const symbolFilterArg = rest.find((a) => a.startsWith('--symbol='));
    const networkArg = rest.find((a) => a.startsWith('--network='));

    if (!evmAddress) {
        console.error('Usage: bun run backend/scripts/dumpAlchemyToken.ts <EVM_ADDRESS> [--token=<TOKEN_CONTRACT>] [--symbol=<SYMBOL>] [--network=<eth-mainnet|polygon-mainnet|bnb-mainnet>]');
        process.exit(1);
    }

    const apiKey = appConfig.alchemy.apiKey;
    if (!apiKey) {
        throw new Error('Missing ALCHEMY_ID in environment/config.');
    }

    const tokenFilter = tokenFilterArg ? tokenFilterArg.split('=')[1].toLowerCase() : '';
    const symbolFilter = symbolFilterArg ? symbolFilterArg.split('=')[1].toLowerCase() : '';
    const networkFilter = networkArg ? networkArg.split('=')[1] : '';

    const request = {
        addresses: [
            {
                address: evmAddress,
                networks: ['eth-mainnet', 'polygon-mainnet', 'bnb-mainnet'],
            },
        ],
        withMetadata: true,
        withPrices: true,
        includeNativeTokens: true,
    };

    const url = `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`;
    const { data } = await axios.post(url, request, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 20000,
    });

    const tokens: BalanceEntry[] = data?.data?.tokens || data?.tokens || [];
    if (!Array.isArray(tokens) || tokens.length === 0) {
        console.log('No tokens returned by Alchemy.');
        return;
    }

    const matches = tokens.filter((t) => {
        const tokenAddr = (t.tokenAddress || '').toLowerCase();
        const symbol = (t.tokenMetadata?.symbol || '').toLowerCase();
        const netOk = networkFilter ? t.network === networkFilter : true;
        const tokenOk = tokenFilter ? tokenAddr === tokenFilter : true;
        const symOk = symbolFilter ? symbol === symbolFilter : true;
        return netOk && tokenOk && symOk;
    });

    if (matches.length === 0) {
        console.log('No matching token entries found with the provided filters. Available tokens:');
        const sample = tokens.slice(0, 10).map((t) => ({ network: t.network, tokenAddress: t.tokenAddress, symbol: t.tokenMetadata?.symbol }));
        console.dir(sample, { depth: null });
        return;
    }

    for (const entry of matches) {
        console.log('\n=== Match =======================================');
        console.log(`Network: ${entry.network}`);
        console.log(`Token Address: ${entry.tokenAddress ?? 'NATIVE'}`);
        console.log(`Symbol: ${entry.tokenMetadata?.symbol}`);
        console.log('--- Full Entry (raw from Alchemy) ---');
        console.dir(entry, { depth: null });
    }
}

main().catch((e) => {
    console.error('Dump script failed:', e?.message || e);
    process.exit(1);
});


