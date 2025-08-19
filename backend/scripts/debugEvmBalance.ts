import axios from 'axios';
import { config as appConfig } from '../src/config';

type AlchemyTokenPrice = {
    currency: string;
    value: string; // stringified number
    lastUpdatedAt: string;
};

type AlchemyTokenMetadata = {
    name: string;
    symbol: string;
    decimals: number | null;
};

type AlchemyTokenBalance = {
    network: string; // e.g. eth-mainnet
    address: string; // queried address
    tokenAddress: string | null; // null for native token
    tokenBalance: string; // hex string (0x...)
    tokenMetadata: AlchemyTokenMetadata;
    tokenPrices: AlchemyTokenPrice[]; // prices in multiple currencies
};

type AlchemyBalanceRequest = {
    addresses: Array<{
        address: string;
        networks: string[];
    }>;
    withMetadata?: boolean;
    withPrices?: boolean;
    includeNativeTokens?: boolean;
};

type AlchemyBalanceResponse = {
    tokens: AlchemyTokenBalance[];
    pageKey?: string | null;
};

const ALCHEMY_NETWORKS: Record<string, string> = {
    ethereum: 'eth-mainnet',
    polygon: 'polygon-mainnet',
    bsc: 'bnb-mainnet',
};

function getUsdPrice(prices: AlchemyTokenPrice[]): number {
    const usd = prices?.find((p) => p.currency?.toLowerCase() === 'usd');
    return usd ? parseFloat(usd.value) : 0;
}

function formatNumber(value: number, digits = 2): string {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

function pad(str: string, len: number): string {
    if (str.length >= len) return str.slice(0, len);
    return str + ' '.repeat(len - str.length);
}

async function fetchAlchemyBalances(address: string): Promise<AlchemyTokenBalance[]> {
    const apiKey = appConfig.alchemy.apiKey;
    if (!apiKey) {
        throw new Error('Missing ALCHEMY_ID in environment/config.');
    }

    const request: AlchemyBalanceRequest = {
        addresses: [
            {
                address,
                networks: Object.values(ALCHEMY_NETWORKS),
            },
        ],
        withMetadata: true,
        withPrices: true,
        includeNativeTokens: true,
    };

    const url = `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`;
    const { data } = await axios.post<AlchemyBalanceResponse>(url, request, {
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        timeout: 15000,
    });

    return data.tokens || [];
}

async function main() {
    const args = process.argv.slice(2);
    const address = args[0];
    const minUsdArg = args.find((a) => a.startsWith('--minUsd='));
    const limitArg = args.find((a) => a.startsWith('--limit='));
    const dumpZeroArg = args.find((a) => a === '--showZero');

    if (!address) {
        console.error('Usage: bun run backend/scripts/debugEvmBalance.ts <EVM_ADDRESS> [--minUsd=1] [--limit=50] [--showZero]');
        process.exit(1);
    }

    const minUsd = minUsdArg ? parseFloat(minUsdArg.split('=')[1]) : 0.01;
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 1000;
    const showZero = Boolean(dumpZeroArg);

    console.log('=== Debug EVM Balance (Alchemy Portfolio) ===');
    console.log('Address:', address);
    console.log('Networks:', Object.values(ALCHEMY_NETWORKS).join(', '));
    console.log('Min USD filter:', minUsd);
    console.log('---');

    const tokens = await fetchAlchemyBalances(address);
    if (!tokens.length) {
        console.log('No tokens returned by Alchemy.');
        process.exit(0);
    }

    type Row = {
        network: string;
        tokenAddress: string;
        symbol: string;
        decimals: number;
        balanceHex: string;
        tokenAmount: number;
        usdPrice: number;
        usdValue: number;
    };

    const rows: Row[] = [];
    let totalUsd = 0;
    for (const t of tokens) {
        try {
            const decimals = t.tokenMetadata?.decimals ?? 18; // fallback for native
            const balanceHex = t.tokenBalance || '0x0';
            const balanceBig = BigInt(balanceHex);
            // Note: Number() may lose precision for very large values; sufficient for debugging contributors
            const tokenAmount = Number(balanceBig) / Math.pow(10, decimals);
            const usdPrice = getUsdPrice(t.tokenPrices || []);
            const usdValue = tokenAmount * usdPrice;

            rows.push({
                network: t.network,
                tokenAddress: t.tokenAddress ?? 'NATIVE',
                symbol: t.tokenMetadata?.symbol || (t.tokenAddress ? '-' : 'NATIVE'),
                decimals: decimals ?? 18,
                balanceHex,
                tokenAmount,
                usdPrice,
                usdValue,
            });

            totalUsd += isFinite(usdValue) ? usdValue : 0;
        } catch (err) {
            console.warn('Failed to process token entry:', t?.tokenMetadata?.symbol, err);
        }
    }

    rows.sort((a, b) => b.usdValue - a.usdValue);

    console.log(`Total (raw sum): $${formatNumber(totalUsd, 2)}`);
    console.log('Top contributors:');
    console.log(
        [
            pad('Network', 14),
            pad('Symbol', 10),
            pad('TokenAddr/NATIVE', 44),
            pad('Decimals', 8),
            pad('Amount', 18),
            pad('USD Price', 12),
            pad('USD Value', 14),
        ].join('  ')
    );

    let shown = 0;
    for (const r of rows) {
        if (!showZero && r.usdValue < minUsd) continue;
        if (shown >= limit) break;
        console.log(
            [
                pad(r.network, 14),
                pad(r.symbol, 10),
                pad(r.tokenAddress, 44),
                pad(String(r.decimals), 8),
                pad(formatNumber(r.tokenAmount, 6), 18),
                pad(`$${formatNumber(r.usdPrice, 6)}`, 12),
                pad(`$${formatNumber(r.usdValue, 2)}`, 14),
            ].join('  ')
        );
        shown++;
    }

    // Group by network summary
    const byNetwork = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.network] = (acc[r.network] || 0) + (isFinite(r.usdValue) ? r.usdValue : 0);
        return acc;
    }, {});

    console.log('\nBy network:');
    for (const [net, sum] of Object.entries(byNetwork)) {
        console.log(`- ${net}: $${formatNumber(sum, 2)}`);
    }

    // Highlight suspicious entries
    const suspicious = rows.filter((r) => r.usdPrice > 0 && r.tokenAmount > 0 && !isFinite(r.usdValue));
    if (suspicious.length) {
        console.log('\nSuspicious entries (non-finite values):', suspicious.length);
    }
}

main().catch((e) => {
    console.error('Debug script failed:', e?.message || e);
    process.exit(1);
});


