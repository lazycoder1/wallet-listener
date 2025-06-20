import logger from '../config/logger';

interface MemorySnapshot {
    timestamp: number;
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
}

export class MemoryLeakDetector {
    private static instance: MemoryLeakDetector;
    private snapshots: MemorySnapshot[] = [];
    private maxSnapshots: number = 60; // Keep last 60 snapshots (1 hour at 1-minute intervals)
    private growthThreshold: number = 50 * 1024 * 1024; // 50MB growth threshold
    private monitorInterval: NodeJS.Timeout | null = null;

    private constructor() { }

    public static getInstance(): MemoryLeakDetector {
        if (!MemoryLeakDetector.instance) {
            MemoryLeakDetector.instance = new MemoryLeakDetector();
        }
        return MemoryLeakDetector.instance;
    }

    public startMonitoring(intervalMs: number = 60000): void {
        if (this.monitorInterval) {
            this.stopMonitoring();
        }

        this.monitorInterval = setInterval(() => {
            this.takeSnapshot();
            this.analyzeMemoryTrend();
        }, intervalMs);

        logger.info('Memory leak detection started');
    }

    public stopMonitoring(): void {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            logger.info('Memory leak detection stopped');
        }
    }

    private takeSnapshot(): void {
        const memUsage = process.memoryUsage();
        const snapshot: MemorySnapshot = {
            timestamp: Date.now(),
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers
        };

        this.snapshots.push(snapshot);

        // Keep only the last maxSnapshots
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }
    }

    private analyzeMemoryTrend(): void {
        if (this.snapshots.length < 3) {
            return; // Need at least 3 snapshots to analyze trend
        }

        const recent = this.snapshots.slice(-3);
        const older = this.snapshots.slice(-6, -3);

        if (older.length === 0) {
            return;
        }

        const recentAvg = this.calculateAverage(recent.map(s => s.heapUsed));
        const olderAvg = this.calculateAverage(older.map(s => s.heapUsed));
        const growth = recentAvg - olderAvg;

        if (growth > this.growthThreshold) {
            logger.warn(`Potential memory leak detected: ${Math.round(growth / 1024 / 1024)}MB growth over last 3 minutes`);
            this.logDetailedAnalysis();
        }

        // Check for continuous growth over longer period
        if (this.snapshots.length >= 10) {
            const longTermGrowth = this.snapshots[this.snapshots.length - 1].heapUsed - this.snapshots[0].heapUsed;
            if (longTermGrowth > this.growthThreshold * 2) {
                logger.warn(`Long-term memory growth detected: ${Math.round(longTermGrowth / 1024 / 1024)}MB over ${Math.round((this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp) / 60000)} minutes`);
            }
        }
    }

    private calculateAverage(values: number[]): number {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    private logDetailedAnalysis(): void {
        if (this.snapshots.length < 2) return;

        const latest = this.snapshots[this.snapshots.length - 1];
        const previous = this.snapshots[this.snapshots.length - 2];

        logger.info('Memory analysis:', {
            timeSpan: `${Math.round((latest.timestamp - previous.timestamp) / 1000)}s`,
            rssGrowth: `${Math.round((latest.rss - previous.rss) / 1024 / 1024)}MB`,
            heapGrowth: `${Math.round((latest.heapUsed - previous.heapUsed) / 1024 / 1024)}MB`,
            externalGrowth: `${Math.round((latest.external - previous.external) / 1024 / 1024)}MB`,
            arrayBufferGrowth: `${Math.round((latest.arrayBuffers - previous.arrayBuffers) / 1024 / 1024)}MB`
        });
    }

    public getMemoryStats(): {
        current: MemorySnapshot | null;
        trend: 'stable' | 'growing' | 'declining';
        growthRate: number;
    } {
        if (this.snapshots.length < 2) {
            return {
                current: this.snapshots[this.snapshots.length - 1] || null,
                trend: 'stable',
                growthRate: 0
            };
        }

        const recent = this.snapshots.slice(-5);
        const older = this.snapshots.slice(-10, -5);

        if (older.length === 0) {
            return {
                current: this.snapshots[this.snapshots.length - 1],
                trend: 'stable',
                growthRate: 0
            };
        }

        const recentAvg = this.calculateAverage(recent.map(s => s.heapUsed));
        const olderAvg = this.calculateAverage(older.map(s => s.heapUsed));
        const growthRate = (recentAvg - olderAvg) / (1024 * 1024); // MB per interval

        let trend: 'stable' | 'growing' | 'declining' = 'stable';
        if (growthRate > 10) trend = 'growing';
        else if (growthRate < -10) trend = 'declining';

        return {
            current: this.snapshots[this.snapshots.length - 1],
            trend,
            growthRate
        };
    }

    public cleanup(): void {
        this.stopMonitoring();
        this.snapshots = [];
    }
} 