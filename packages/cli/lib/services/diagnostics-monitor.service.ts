import chalk from 'chalk';

interface MemorySample {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
}

interface CPUSample {
    user: number;
    system: number;
}

interface Sample {
    timestamp: number;
    memory: MemorySample;
    cpu: CPUSample;
}

interface MemoryStats {
    avg: number;
    peak: number;
}

interface CPUStats {
    avg: number;
    peak: number;
}

export interface DiagnosticsStats {
    duration: number;
    memory: {
        rss: MemoryStats;
        heapUsed: MemoryStats;
        heapTotal: MemoryStats;
        external: MemoryStats;
    };
    cpu: CPUStats;
}

export class DiagnosticsMonitor {
    private samples: Sample[] = [];
    private startTime: number = 0;
    private startCpu: CPUSample = { user: 0, system: 0 };
    private intervalId: NodeJS.Timeout | null = null;
    private currentInterval: number = 100; // Start with 100ms baseline
    private lastSample: Sample | null = null;
    private stableCount: number = 0;

    start(): void {
        this.startTime = Date.now();
        this.startCpu = process.cpuUsage();
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

        const duration = Date.now() - this.startTime;

        return {
            duration,
            memory: {
                rss: this.calculateMemoryStats('rss'),
                heapUsed: this.calculateMemoryStats('heapUsed'),
                heapTotal: this.calculateMemoryStats('heapTotal'),
                external: this.calculateMemoryStats('external')
            },
            cpu: this.calculateCPUStats()
        };
    }

    private takeSample(): void {
        const memory = process.memoryUsage();
        const cpu = process.cpuUsage(this.startCpu);

        const sample: Sample = {
            timestamp: Date.now() - this.startTime,
            memory: {
                rss: memory.rss,
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                external: memory.external
            },
            cpu: {
                user: cpu.user,
                system: cpu.system
            }
        };

        this.samples.push(sample);

        // Adaptive sampling: adjust interval based on changes
        if (this.lastSample) {
            const hasSignificantChange = this.detectSignificantChange(this.lastSample, sample);

            if (hasSignificantChange) {
                // Increase sampling rate when changes detected
                this.currentInterval = 50;
                this.stableCount = 0;
            } else {
                this.stableCount++;
                // Decrease back to baseline after 5 stable samples
                if (this.stableCount >= 5) {
                    this.currentInterval = 100;
                }
            }
        }

        this.lastSample = sample;
    }

    private detectSignificantChange(prev: Sample, current: Sample): boolean {
        const MEMORY_THRESHOLD = 5 * 1024 * 1024; // 5MB
        const CPU_THRESHOLD = 0.1; // 10%

        // Check memory change
        const memoryChange = Math.abs(current.memory.rss - prev.memory.rss);
        if (memoryChange > MEMORY_THRESHOLD) {
            return true;
        }

        // Check CPU change (approximate percentage)
        const prevCpuTotal = prev.cpu.user + prev.cpu.system;
        const currentCpuTotal = current.cpu.user + current.cpu.system;
        const timeDiff = current.timestamp - prev.timestamp;

        if (timeDiff > 0) {
            const prevCpuPercent = (prevCpuTotal / (timeDiff * 1000)) * 100;
            const currentCpuPercent = (currentCpuTotal / (timeDiff * 1000)) * 100;
            const cpuChange = Math.abs(currentCpuPercent - prevCpuPercent);

            if (cpuChange > CPU_THRESHOLD) {
                return true;
            }
        }

        return false;
    }

    private scheduleNextSample(): void {
        this.intervalId = setTimeout(() => {
            this.takeSample();
            this.scheduleNextSample();
        }, this.currentInterval);
    }

    private calculateMemoryStats(metric: keyof MemorySample): MemoryStats {
        if (this.samples.length === 0) {
            return { avg: 0, peak: 0 };
        }

        const values = this.samples.map((s) => s.memory[metric]);
        const sum = values.reduce((acc, val) => acc + val, 0);

        return {
            avg: sum / values.length,
            peak: Math.max(...values)
        };
    }

    private calculateCPUStats(): CPUStats {
        if (this.samples.length === 0) {
            return { avg: 0, peak: 0 };
        }

        // Calculate CPU percentage for each sample interval
        const cpuPercentages: number[] = [];

        for (let i = 1; i < this.samples.length; i++) {
            const prev = this.samples[i - 1]!;
            const current = this.samples[i]!;
            const timeDiff = current.timestamp - prev.timestamp;

            if (timeDiff > 0) {
                const cpuDiff = current.cpu.user + current.cpu.system - (prev.cpu.user + prev.cpu.system);
                // CPU usage is in microseconds, convert to percentage
                const cpuPercent = (cpuDiff / (timeDiff * 1000)) * 100;
                cpuPercentages.push(cpuPercent);
            }
        }

        if (cpuPercentages.length === 0) {
            return { avg: 0, peak: 0 };
        }

        const sum = cpuPercentages.reduce((acc, val) => acc + val, 0);

        return {
            avg: sum / cpuPercentages.length,
            peak: Math.max(...cpuPercentages)
        };
    }
}

export function formatDiagnostics(stats: DiagnosticsStats): string {
    const lines: string[] = [];

    lines.push(chalk.gray('━'.repeat(60)));
    lines.push(chalk.bold('Diagnostics Summary'));
    lines.push(chalk.gray('━'.repeat(60)));
    lines.push(`Duration: ${chalk.cyan((stats.duration / 1000).toFixed(2) + 's')}`);
    lines.push('');

    // Memory stats
    lines.push(chalk.bold('Memory (RSS):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.rss.avg))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.rss.peak))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (Heap Used):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.heapUsed.avg))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.heapUsed.peak))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (Heap Total):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.heapTotal.avg))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.heapTotal.peak))}`);
    lines.push('');

    lines.push(chalk.bold('Memory (External):'));
    lines.push(`  Average: ${chalk.cyan(formatBytes(stats.memory.external.avg))}`);
    lines.push(`  Peak:    ${chalk.cyan(formatBytes(stats.memory.external.peak))}`);
    lines.push('');

    lines.push(chalk.bold('CPU Usage:'));
    lines.push(`  Average: ${chalk.cyan(stats.cpu.avg.toFixed(1) + '%')}`);
    lines.push(`  Peak:    ${chalk.cyan(stats.cpu.peak.toFixed(1) + '%')}`);

    lines.push(chalk.gray('━'.repeat(60)));

    return lines.join('\n');
}

function formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + ' MB';
}
