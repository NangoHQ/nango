import chalk from 'chalk';

interface MemorySample {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
}

interface CPUSample {
    userMicros: number;
    systemMicros: number;
}

interface Sample {
    timestampMs: number;
    memory: MemorySample;
    cpu: CPUSample;
}

interface MemoryStats {
    avgBytes: number;
    peakBytes: number;
}

interface CPUStats {
    avgPercent: number;
    peakPercent: number;
}

export interface DiagnosticsStats {
    durationMs: number;
    memory: {
        rss: MemoryStats;
        heapUsed: MemoryStats;
        heapTotal: MemoryStats;
        external: MemoryStats;
    };
    cpu: CPUStats;
}

export class DiagnosticsMonitor {
    private static readonly MAX_SAMPLES = 5000; // Limit samples to prevent unbounded growth
    private samples: Sample[] = [];
    private startTimeMs: number = 0;
    private startCpu: CPUSample = { userMicros: 0, systemMicros: 0 };
    private intervalId: NodeJS.Timeout | null = null;
    private currentIntervalMs: number = 100; // Start with 100ms baseline
    private lastSample: Sample | null = null;
    private stableCount: number = 0;

    start(): void {
        this.startTimeMs = Date.now();
        const cpuUsage = process.cpuUsage();
        this.startCpu = { userMicros: cpuUsage.user, systemMicros: cpuUsage.system };
        this.takeSample(); // Initial sample
        this.scheduleNextSample();
    }

    stop(): DiagnosticsStats {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }

        // Take final sample
        this.takeSample();

        const durationMs = Date.now() - this.startTimeMs;

        return {
            durationMs,
            memory: {
                rss: this.calculateMemoryStats('rssBytes'),
                heapUsed: this.calculateMemoryStats('heapUsedBytes'),
                heapTotal: this.calculateMemoryStats('heapTotalBytes'),
                external: this.calculateMemoryStats('externalBytes')
            },
            cpu: this.calculateCPUStats()
        };
    }

    private takeSample(): void {
        const memory = process.memoryUsage();
        const cpu = process.cpuUsage({ user: this.startCpu.userMicros, system: this.startCpu.systemMicros });

        const sample: Sample = {
            timestampMs: Date.now() - this.startTimeMs,
            memory: {
                rssBytes: memory.rss,
                heapUsedBytes: memory.heapUsed,
                heapTotalBytes: memory.heapTotal,
                externalBytes: memory.external
            },
            cpu: {
                userMicros: cpu.user,
                systemMicros: cpu.system
            }
        };

        this.samples.push(sample);

        // Remove oldest sample if we've reached the limit
        if (this.samples.length > DiagnosticsMonitor.MAX_SAMPLES) {
            this.samples.shift();
        }

        // Adaptive sampling: adjust interval based on changes
        if (this.lastSample) {
            const hasSignificantChange = this.detectSignificantChange(this.lastSample, sample);

            if (hasSignificantChange) {
                // Increase sampling rate when changes detected
                this.currentIntervalMs = 50;
                this.stableCount = 0;
            } else {
                this.stableCount++;
                // Decrease back to baseline after 5 stable samples
                if (this.stableCount >= 5) {
                    this.currentIntervalMs = 100;
                }
            }
        }

        this.lastSample = sample;
    }

    private detectSignificantChange(prev: Sample, current: Sample): boolean {
        const MEMORY_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB
        const CPU_THRESHOLD_PERCENT = 0.1; // 10%

        // Check memory change
        const memoryChangeBytes = Math.abs(current.memory.rssBytes - prev.memory.rssBytes);
        if (memoryChangeBytes > MEMORY_THRESHOLD_BYTES) {
            return true;
        }

        // Check CPU change (approximate percentage)
        const prevCpuTotalMicros = prev.cpu.userMicros + prev.cpu.systemMicros;
        const currentCpuTotalMicros = current.cpu.userMicros + current.cpu.systemMicros;
        const timeDiffMs = current.timestampMs - prev.timestampMs;

        if (timeDiffMs > 0) {
            // Convert: (microseconds / (milliseconds * 1000 micros/ms)) * 100 = percentage
            const prevCpuPercent = (prevCpuTotalMicros / (timeDiffMs * 1000)) * 100;
            const currentCpuPercent = (currentCpuTotalMicros / (timeDiffMs * 1000)) * 100;
            const cpuChangePercent = Math.abs(currentCpuPercent - prevCpuPercent);

            if (cpuChangePercent > CPU_THRESHOLD_PERCENT) {
                return true;
            }
        }

        return false;
    }

    private scheduleNextSample(): void {
        this.intervalId = setTimeout(() => {
            this.takeSample();
            this.scheduleNextSample();
        }, this.currentIntervalMs);
    }

    private calculateMemoryStats(metric: keyof MemorySample): MemoryStats {
        if (this.samples.length === 0) {
            return { avgBytes: 0, peakBytes: 0 };
        }

        const valuesBytes = this.samples.map((s) => s.memory[metric]);
        const sumBytes = valuesBytes.reduce((acc, val) => acc + val, 0);

        return {
            avgBytes: sumBytes / valuesBytes.length,
            peakBytes: Math.max(...valuesBytes)
        };
    }

    private calculateCPUStats(): CPUStats {
        if (this.samples.length === 0) {
            return { avgPercent: 0, peakPercent: 0 };
        }

        // Calculate CPU percentage for each sample interval
        const cpuPercentages: number[] = [];

        for (let i = 1; i < this.samples.length; i++) {
            const prev = this.samples[i - 1]!;
            const current = this.samples[i]!;
            const timeDiffMs = current.timestampMs - prev.timestampMs;

            if (timeDiffMs > 0) {
                const cpuDiffMicros = current.cpu.userMicros + current.cpu.systemMicros - (prev.cpu.userMicros + prev.cpu.systemMicros);
                // Convert: (microseconds / (milliseconds * 1000 micros/ms)) * 100 = percentage
                const cpuPercent = (cpuDiffMicros / (timeDiffMs * 1000)) * 100;
                cpuPercentages.push(cpuPercent);
            }
        }

        if (cpuPercentages.length === 0) {
            return { avgPercent: 0, peakPercent: 0 };
        }

        const sumPercent = cpuPercentages.reduce((acc, val) => acc + val, 0);

        return {
            avgPercent: sumPercent / cpuPercentages.length,
            peakPercent: Math.max(...cpuPercentages)
        };
    }
}

export function formatDiagnostics(stats: DiagnosticsStats): string {
    const lines: string[] = [];

    lines.push(chalk.gray('━'.repeat(60)));
    lines.push(chalk.bold('Diagnostics Summary'));
    lines.push(chalk.gray('━'.repeat(60)));
    lines.push(`Duration: ${chalk.cyan((stats.durationMs / 1000).toFixed(2) + 's')}`);
    lines.push('');

    // Memory stats
    lines.push(chalk.bold('Memory (RSS):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.rss.avgBytes))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.rss.peakBytes))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (Heap Used):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.heapUsed.avgBytes))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.heapUsed.peakBytes))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (Heap Total):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.heapTotal.avgBytes))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.heapTotal.peakBytes))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (External):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.external.avgBytes))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.external.peakBytes))}`);
    lines.push('');

    lines.push(chalk.bold('CPU Usage:'));
    lines.push(`  Average: ${chalk.cyan(stats.cpu.avgPercent.toFixed(1) + '%')}`);
    lines.push(`  Peak:    ${chalk.cyan(stats.cpu.peakPercent.toFixed(1) + '%')}`);

    lines.push(chalk.gray('━'.repeat(60)));

    return lines.join('\n');
}

function formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + ' MB';
}
