// BuzzManager - Handles buzz timing, lockout, and anti-spam for Clueboard
// Following HYTOPIA SDK patterns for server-authoritative gameplay

import { Player } from 'hytopia';
import { BUZZ_LOCKOUT_MS, BUZZ_WINDOW_MS, BUZZ_RATE_LIMIT_MS, MAX_BUZZES_PER_SECOND } from '../net/Events';

export interface BuzzAttempt {
    playerId: string;
    player: Player;
    clientTimestamp: number;
    serverTimestamp: number;
    latency?: number;
}

export interface BuzzWindow {
    startTime: number;
    lockoutUntil: number;
    windowEnd: number;
    active: boolean;
    winnerId?: string;
    lockedPlayers: Set<string>;
}

export interface BuzzResult {
    success: boolean;
    winnerId?: string;
    winnerName?: string;
    buzzTime?: number;
    reason?: 'too_early' | 'too_late' | 'already_won' | 'player_locked' | 'rate_limited' | 'window_closed';
    lockedPlayers: string[];
}

export class BuzzManager {
    private currentWindow: BuzzWindow | null = null;
    private playerLastBuzz: Map<string, number> = new Map();
    private playerBuzzCounts: Map<string, { count: number; windowStart: number }> = new Map();
    private buzzQueue: BuzzAttempt[] = [];
    private gameStartTime: number = Date.now();

    constructor() {
        this.reset();
    }

    /**
     * Start a new buzz window with lockout period
     */
    startBuzzWindow(): BuzzWindow {
        const now = Date.now();
        
        this.currentWindow = {
            startTime: now,
            lockoutUntil: now + BUZZ_LOCKOUT_MS,
            windowEnd: now + BUZZ_LOCKOUT_MS + BUZZ_WINDOW_MS,
            active: true,
            winnerId: undefined,
            lockedPlayers: new Set()
        };

        this.buzzQueue = [];
        return { ...this.currentWindow };
    }

    /**
     * Process a buzz attempt from a player
     */
    processBuzz(player: Player, clientTimestamp: number): BuzzResult {
        const now = Date.now();
        const playerId = player.id;

        // Check if there's an active buzz window
        if (!this.currentWindow || !this.currentWindow.active) {
            return {
                success: false,
                reason: 'window_closed',
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        // Check rate limiting
        if (!this.checkRateLimit(playerId, now)) {
            return {
                success: false,
                reason: 'rate_limited',
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        // Check if player is locked for this clue
        if (this.currentWindow.lockedPlayers.has(playerId)) {
            return {
                success: false,
                reason: 'player_locked',
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        // Check if someone already won
        if (this.currentWindow.winnerId) {
            return {
                success: false,
                reason: 'already_won',
                winnerId: this.currentWindow.winnerId,
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        // Check timing
        if (now < this.currentWindow.lockoutUntil) {
            return {
                success: false,
                reason: 'too_early',
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        if (now > this.currentWindow.windowEnd) {
            this.currentWindow.active = false;
            return {
                success: false,
                reason: 'too_late',
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        // Valid buzz! Record the attempt
        const buzzAttempt: BuzzAttempt = {
            playerId,
            player,
            clientTimestamp,
            serverTimestamp: now,
            latency: Math.abs(now - clientTimestamp)
        };

        this.buzzQueue.push(buzzAttempt);
        this.updatePlayerBuzzTracking(playerId, now);

        // If this is the first valid buzz, they win
        if (!this.currentWindow.winnerId) {
            this.currentWindow.winnerId = playerId;
            
            return {
                success: true,
                winnerId: playerId,
                winnerName: player.username,
                buzzTime: now - this.currentWindow.lockoutUntil,
                lockedPlayers: this.getLockedPlayersList()
            };
        }

        return {
            success: false,
            reason: 'already_won',
            winnerId: this.currentWindow.winnerId,
            lockedPlayers: this.getLockedPlayersList()
        };
    }

    /**
     * Lock a player from buzzing for the current clue (wrong answer)
     */
    lockPlayer(playerId: string): void {
        if (this.currentWindow) {
            this.currentWindow.lockedPlayers.add(playerId);
        }
    }

    /**
     * Get the current buzz window winner
     */
    getCurrentWinner(): string | undefined {
        return this.currentWindow?.winnerId;
    }

    /**
     * Check if the buzz window is active
     */
    isBuzzWindowActive(): boolean {
        if (!this.currentWindow) return false;
        
        const now = Date.now();
        
        // Window is active if we're past lockout and before window end, and no winner yet
        return this.currentWindow.active && 
               now >= this.currentWindow.lockoutUntil && 
               now <= this.currentWindow.windowEnd &&
               !this.currentWindow.winnerId;
    }

    /**
     * Check if we're in lockout period
     */
    isInLockout(): boolean {
        if (!this.currentWindow) return false;
        
        const now = Date.now();
        return now < this.currentWindow.lockoutUntil;
    }

    /**
     * Get time remaining in current phase
     */
    getTimeRemaining(): { lockoutMs?: number; buzzWindowMs?: number; phase: 'lockout' | 'buzz' | 'closed' } {
        if (!this.currentWindow) {
            return { phase: 'closed' };
        }

        const now = Date.now();

        if (now < this.currentWindow.lockoutUntil) {
            return {
                lockoutMs: this.currentWindow.lockoutUntil - now,
                phase: 'lockout'
            };
        }

        if (now <= this.currentWindow.windowEnd && this.currentWindow.active) {
            return {
                buzzWindowMs: this.currentWindow.windowEnd - now,
                phase: 'buzz'
            };
        }

        return { phase: 'closed' };
    }

    /**
     * Close the current buzz window
     */
    closeBuzzWindow(): void {
        if (this.currentWindow) {
            this.currentWindow.active = false;
        }
    }

    /**
     * Reset the buzz manager for new game/round
     */
    reset(): void {
        this.currentWindow = null;
        this.playerLastBuzz.clear();
        this.playerBuzzCounts.clear();
        this.buzzQueue = [];
        this.gameStartTime = Date.now();
    }

    /**
     * Get player statistics for buzz performance
     */
    getPlayerBuzzStats(playerId: string): {
        totalBuzzes: number;
        buzzWins: number;
        averageBuzzTime: number;
        fastestBuzz: number;
    } {
        const attempts = this.buzzQueue.filter(attempt => attempt.playerId === playerId);
        const wins = attempts.filter(attempt => this.wasWinningBuzz(attempt));
        
        const buzzTimes = attempts.map(attempt => 
            attempt.serverTimestamp - (this.getAttemptWindowStartTime(attempt) + BUZZ_LOCKOUT_MS)
        ).filter(time => time >= 0);

        return {
            totalBuzzes: attempts.length,
            buzzWins: wins.length,
            averageBuzzTime: buzzTimes.length > 0 ? buzzTimes.reduce((a, b) => a + b, 0) / buzzTimes.length : 0,
            fastestBuzz: buzzTimes.length > 0 ? Math.min(...buzzTimes) : 0
        };
    }

    /**
     * Get all buzz attempts for the current window (for debugging/analysis)
     */
    getCurrentBuzzAttempts(): BuzzAttempt[] {
        return [...this.buzzQueue];
    }

    /**
     * Check rate limiting for a player
     */
    private checkRateLimit(playerId: string, now: number): boolean {
        // Check minimum time between buzzes
        const lastBuzz = this.playerLastBuzz.get(playerId);
        if (lastBuzz && (now - lastBuzz) < BUZZ_RATE_LIMIT_MS) {
            return false;
        }

        // Check buzzes per second limit
        const buzzData = this.playerBuzzCounts.get(playerId);
        if (buzzData) {
            const windowDuration = now - buzzData.windowStart;
            
            if (windowDuration < 1000) {
                if (buzzData.count >= MAX_BUZZES_PER_SECOND) {
                    return false;
                }
            } else {
                // Reset window
                this.playerBuzzCounts.set(playerId, { count: 0, windowStart: now });
            }
        } else {
            this.playerBuzzCounts.set(playerId, { count: 0, windowStart: now });
        }

        return true;
    }

    /**
     * Update player buzz tracking for rate limiting
     */
    private updatePlayerBuzzTracking(playerId: string, now: number): void {
        this.playerLastBuzz.set(playerId, now);
        
        const buzzData = this.playerBuzzCounts.get(playerId);
        if (buzzData) {
            buzzData.count++;
        }
    }

    /**
     * Get list of currently locked players
     */
    private getLockedPlayersList(): string[] {
        return this.currentWindow ? Array.from(this.currentWindow.lockedPlayers) : [];
    }

    /**
     * Check if a buzz attempt was the winning buzz
     */
    private wasWinningBuzz(attempt: BuzzAttempt): boolean {
        // Find the window this attempt belonged to and check if it was the winner
        return this.currentWindow?.winnerId === attempt.playerId;
    }

    /**
     * Get the window start time for a buzz attempt (for calculating buzz time)
     */
    private getAttemptWindowStartTime(attempt: BuzzAttempt): number {
        // For current implementation, we only track current window
        // In a more sophisticated version, you might track multiple windows
        return this.currentWindow?.startTime || attempt.serverTimestamp;
    }

    /**
     * Get current window state for debugging
     */
    getWindowState(): BuzzWindow | null {
        return this.currentWindow ? { ...this.currentWindow } : null;
    }

    /**
     * Force clear all player locks (for new clue)
     */
    clearAllLocks(): void {
        if (this.currentWindow) {
            this.currentWindow.lockedPlayers.clear();
        }
    }

    /**
     * Get locked players for display
     */
    getLockedPlayers(): string[] {
        return this.getLockedPlayersList();
    }

    /**
     * Check if specific player is locked
     */
    isPlayerLocked(playerId: string): boolean {
        return this.currentWindow?.lockedPlayers.has(playerId) || false;
    }
}

export default BuzzManager;