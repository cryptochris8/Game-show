import { logger } from './Logger';

/**
 * Centralized timer management to prevent memory leaks
 * Ensures all timers are properly cleaned up
 */
export class TimerManager {
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private intervals: Map<string, NodeJS.Timeout> = new Map();
    private componentName: string;

    constructor(componentName: string) {
        this.componentName = componentName;
    }

    /**
     * Set a timeout with automatic cleanup
     */
    setTimeout(name: string, callback: () => void, delay: number): void {
        this.clearTimeout(name);

        try {
            const timer = setTimeout(() => {
                this.timers.delete(name);
                try {
                    callback();
                } catch (error) {
                    logger.error(`Timer callback error in ${name}`, error as Error, {
                        component: this.componentName,
                        timerName: name
                    });
                }
            }, delay);

            this.timers.set(name, timer);

            logger.debug(`Timer set: ${name} for ${delay}ms`, {
                component: this.componentName,
                timerName: name,
                delay
            });
        } catch (error) {
            logger.error(`Failed to set timer: ${name}`, error as Error, {
                component: this.componentName,
                timerName: name
            });
        }
    }

    /**
     * Set an interval with automatic cleanup
     */
    setInterval(name: string, callback: () => void, interval: number): void {
        this.clearInterval(name);

        try {
            const timer = setInterval(() => {
                try {
                    callback();
                } catch (error) {
                    logger.error(`Interval callback error in ${name}`, error as Error, {
                        component: this.componentName,
                        intervalName: name
                    });
                    // Stop interval on error to prevent continuous failures
                    this.clearInterval(name);
                }
            }, interval);

            this.intervals.set(name, timer);

            logger.debug(`Interval set: ${name} every ${interval}ms`, {
                component: this.componentName,
                intervalName: name,
                interval
            });
        } catch (error) {
            logger.error(`Failed to set interval: ${name}`, error as Error, {
                component: this.componentName,
                intervalName: name
            });
        }
    }

    /**
     * Clear a specific timeout
     */
    clearTimeout(name: string): void {
        const timer = this.timers.get(name);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(name);
            logger.debug(`Timer cleared: ${name}`, {
                component: this.componentName,
                timerName: name
            });
        }
    }

    /**
     * Clear a specific interval
     */
    clearInterval(name: string): void {
        const interval = this.intervals.get(name);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(name);
            logger.debug(`Interval cleared: ${name}`, {
                component: this.componentName,
                intervalName: name
            });
        }
    }

    /**
     * Clear all timers and intervals
     */
    clearAll(): void {
        // Clear all timeouts
        this.timers.forEach((timer, name) => {
            clearTimeout(timer);
            logger.debug(`Timer cleared during cleanup: ${name}`, {
                component: this.componentName,
                timerName: name
            });
        });
        this.timers.clear();

        // Clear all intervals
        this.intervals.forEach((interval, name) => {
            clearInterval(interval);
            logger.debug(`Interval cleared during cleanup: ${name}`, {
                component: this.componentName,
                intervalName: name
            });
        });
        this.intervals.clear();

        logger.info(`All timers cleared for ${this.componentName}`, {
            component: this.componentName
        });
    }

    /**
     * Check if a timer exists
     */
    hasTimeout(name: string): boolean {
        return this.timers.has(name);
    }

    /**
     * Check if an interval exists
     */
    hasInterval(name: string): boolean {
        return this.intervals.has(name);
    }

    /**
     * Get active timer count
     */
    getActiveCount(): { timeouts: number; intervals: number } {
        return {
            timeouts: this.timers.size,
            intervals: this.intervals.size
        };
    }
}

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number,
    componentName: string = 'Debounce'
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function(...args: Parameters<T>) {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            try {
                func(...args);
            } catch (error) {
                logger.error('Debounced function error', error as Error, {
                    component: componentName
                });
            }
            timeout = null;
        }, wait);
    };
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number,
    componentName: string = 'Throttle'
): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return function(...args: Parameters<T>) {
        if (!inThrottle) {
            try {
                func(...args);
            } catch (error) {
                logger.error('Throttled function error', error as Error, {
                    component: componentName
                });
            }
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}