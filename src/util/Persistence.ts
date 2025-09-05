// Persistence utilities for Clueboard - Player stats and global leaderboards
// Using HYTOPIA SDK PersistenceManager and Player persistence methods

import { Player, PersistenceManager } from 'hytopia';

// Player Statistics Data Structure
export interface PlayerStats {
    gamesPlayed: number;
    gamesWon: number;
    correctAnswers: number;
    incorrectAnswers: number;
    totalBuzzes: number;
    buzzWins: number;
    averageBuzzTimeMs: number;
    fastestBuzzMs: number;
    longestWinStreak: number;
    currentStreak: number;
    totalScore: number;
    highestSingleGameScore: number;
    dailyDoublesWon: number;
    finalRoundWins: number;
    lastPlayedDate: number;
    totalPlayTimeMs: number;
}

// Global Leaderboard Entry
export interface LeaderboardEntry {
    playerId: string;
    playerName: string;
    value: number;
    rank: number;
    lastUpdated: number;
}

// Leaderboard Types
export type LeaderboardType = 
    | 'mostWins'
    | 'highestScore'
    | 'bestCorrectPercent'
    | 'fastestBuzz'
    | 'longestStreak'
    | 'mostGames';

// Game Session Data (temporary, for single game)
export interface GameSession {
    playerId: string;
    startTime: number;
    endTime?: number;
    score: number;
    correctAnswers: number;
    incorrectAnswers: number;
    buzzes: number;
    buzzWins: number;
    buzzTimes: number[];
    dailyDoubleAttempts: number;
    dailyDoubleWins: number;
    finalRoundWager: number;
    finalRoundCorrect: boolean;
    won: boolean;
    streak: number;
}

export class PersistenceManager_Clueboard {
    private static readonly DEFAULT_PLAYER_STATS: PlayerStats = {
        gamesPlayed: 0,
        gamesWon: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        totalBuzzes: 0,
        buzzWins: 0,
        averageBuzzTimeMs: 0,
        fastestBuzzMs: Infinity,
        longestWinStreak: 0,
        currentStreak: 0,
        totalScore: 0,
        highestSingleGameScore: 0,
        dailyDoublesWon: 0,
        finalRoundWins: 0,
        lastPlayedDate: Date.now(),
        totalPlayTimeMs: 0
    };

    /**
     * Get player statistics with defaults if none exist
     */
    static async getPlayerStats(player: Player): Promise<PlayerStats> {
        try {
            const data = await player.getPersistedData();
            const stats = data?.stats || {};
            
            // Merge with defaults to ensure all fields are present
            return {
                ...this.DEFAULT_PLAYER_STATS,
                ...stats,
                lastPlayedDate: Date.now() // Always update last played
            };
        } catch (error) {
            console.error(`Failed to get player stats for ${player.username}:`, error);
            return { ...this.DEFAULT_PLAYER_STATS };
        }
    }

    /**
     * Update player statistics after a game session
     */
    static async updatePlayerStats(player: Player, session: GameSession): Promise<void> {
        try {
            const currentStats = await this.getPlayerStats(player);
            const gameEndTime = session.endTime || Date.now();
            const gameTimeMs = gameEndTime - session.startTime;
            
            // Calculate new averages and stats
            const newBuzzCount = currentStats.totalBuzzes + session.buzzes;
            const newAverageBuzzTime = newBuzzCount > 0 ? 
                ((currentStats.averageBuzzTimeMs * currentStats.totalBuzzes) + 
                 session.buzzTimes.reduce((sum, time) => sum + time, 0)) / newBuzzCount : 0;
            
            const newFastestBuzz = session.buzzTimes.length > 0 ? 
                Math.min(currentStats.fastestBuzzMs, Math.min(...session.buzzTimes)) : 
                currentStats.fastestBuzzMs;

            // Update streak
            let newCurrentStreak = currentStats.currentStreak;
            let newLongestStreak = currentStats.longestWinStreak;
            
            if (session.won) {
                newCurrentStreak += 1;
                newLongestStreak = Math.max(newLongestStreak, newCurrentStreak);
            } else {
                newCurrentStreak = 0;
            }

            const updatedStats: PlayerStats = {
                gamesPlayed: currentStats.gamesPlayed + 1,
                gamesWon: currentStats.gamesWon + (session.won ? 1 : 0),
                correctAnswers: currentStats.correctAnswers + session.correctAnswers,
                incorrectAnswers: currentStats.incorrectAnswers + session.incorrectAnswers,
                totalBuzzes: newBuzzCount,
                buzzWins: currentStats.buzzWins + session.buzzWins,
                averageBuzzTimeMs: newAverageBuzzTime,
                fastestBuzzMs: newFastestBuzz === Infinity ? 0 : newFastestBuzz,
                longestWinStreak: newLongestStreak,
                currentStreak: newCurrentStreak,
                totalScore: currentStats.totalScore + session.score,
                highestSingleGameScore: Math.max(currentStats.highestSingleGameScore, session.score),
                dailyDoublesWon: currentStats.dailyDoublesWon + session.dailyDoubleWins,
                finalRoundWins: currentStats.finalRoundWins + (session.finalRoundCorrect ? 1 : 0),
                lastPlayedDate: gameEndTime,
                totalPlayTimeMs: currentStats.totalPlayTimeMs + gameTimeMs
            };

            // Save using HYTOPIA's shallow merge
            await player.setPersistedData({ stats: updatedStats });
            
            // Update global leaderboards
            await this.updateGlobalLeaderboards(player, updatedStats);
            
        } catch (error) {
            console.error(`Failed to update player stats for ${player.username}:`, error);
        }
    }

    /**
     * Get global leaderboard for a specific type
     */
    static async getGlobalLeaderboard(type: LeaderboardType, limit: number = 100): Promise<LeaderboardEntry[]> {
        try {
            const leaderboardKey = `leaderboard:${type}`;
            const data = await PersistenceManager.instance.getGlobalData(leaderboardKey);
            
            const entries: LeaderboardEntry[] = Array.isArray(data?.entries) ? data.entries : [];
            
            // Sort and apply ranking
            const sorted = entries
                .sort((a, b) => this.compareLeaderboardValues(type, b.value, a.value))
                .slice(0, limit)
                .map((entry, index) => ({ ...entry, rank: index + 1 }));
            
            return sorted;
        } catch (error) {
            console.error(`Failed to get leaderboard ${type}:`, error);
            return [];
        }
    }

    /**
     * Update global leaderboards with player data
     */
    private static async updateGlobalLeaderboards(player: Player, stats: PlayerStats): Promise<void> {
        const leaderboardUpdates: Array<{ type: LeaderboardType; value: number }> = [
            { type: 'mostWins', value: stats.gamesWon },
            { type: 'highestScore', value: stats.highestSingleGameScore },
            { type: 'fastestBuzz', value: stats.fastestBuzzMs > 0 ? stats.fastestBuzzMs : Infinity },
            { type: 'longestStreak', value: stats.longestWinStreak },
            { type: 'mostGames', value: stats.gamesPlayed }
        ];

        // Add best correct percentage if player has played games
        if (stats.gamesPlayed > 0) {
            const totalAnswers = stats.correctAnswers + stats.incorrectAnswers;
            if (totalAnswers > 0) {
                const correctPercent = Math.round((stats.correctAnswers / totalAnswers) * 100);
                leaderboardUpdates.push({ type: 'bestCorrectPercent', value: correctPercent });
            }
        }

        // Update each leaderboard
        for (const { type, value } of leaderboardUpdates) {
            try {
                await this.updateSingleLeaderboard(type, player, value);
            } catch (error) {
                console.error(`Failed to update leaderboard ${type}:`, error);
            }
        }
    }

    /**
     * Update a single leaderboard with player data
     */
    private static async updateSingleLeaderboard(
        type: LeaderboardType, 
        player: Player, 
        value: number
    ): Promise<void> {
        const leaderboardKey = `leaderboard:${type}`;
        const data = await PersistenceManager.instance.getGlobalData(leaderboardKey);
        
        let entries: LeaderboardEntry[] = Array.isArray(data?.entries) ? data.entries : [];
        
        // Remove existing entry for this player
        entries = entries.filter(entry => entry.playerId !== player.id);
        
        // Add new entry if value is meaningful
        if (this.isSignificantLeaderboardValue(type, value)) {
            const newEntry: LeaderboardEntry = {
                playerId: player.id,
                playerName: player.username,
                value,
                rank: 0, // Will be calculated when retrieving
                lastUpdated: Date.now()
            };
            
            entries.push(newEntry);
        }

        // Sort and keep top 100
        entries = entries
            .sort((a, b) => this.compareLeaderboardValues(type, b.value, a.value))
            .slice(0, 100);

        // Save back to persistence
        await PersistenceManager.instance.setGlobalData(leaderboardKey, { entries });
    }

    /**
     * Compare leaderboard values based on type (higher vs lower is better)
     */
    private static compareLeaderboardValues(type: LeaderboardType, a: number, b: number): number {
        // For fastestBuzz, lower is better
        if (type === 'fastestBuzz') {
            return a - b;
        }
        
        // For all others, higher is better
        return a - b;
    }

    /**
     * Check if a value is significant enough for leaderboard inclusion
     */
    private static isSignificantLeaderboardValue(type: LeaderboardType, value: number): boolean {
        switch (type) {
            case 'mostWins':
            case 'mostGames':
            case 'longestStreak':
                return value > 0;
            case 'highestScore':
                return value > 0;
            case 'bestCorrectPercent':
                return value > 0 && value <= 100;
            case 'fastestBuzz':
                return value > 0 && value < 10000; // Less than 10 seconds
            default:
                return value > 0;
        }
    }

    /**
     * Get player ranking in a specific leaderboard
     */
    static async getPlayerRanking(player: Player, type: LeaderboardType): Promise<{ rank: number; total: number } | null> {
        try {
            const leaderboard = await this.getGlobalLeaderboard(type, 1000); // Get more entries for accurate ranking
            const playerEntry = leaderboard.find(entry => entry.playerId === player.id);
            
            if (playerEntry) {
                return {
                    rank: playerEntry.rank,
                    total: leaderboard.length
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Failed to get player ranking for ${player.username}:`, error);
            return null;
        }
    }

    /**
     * Get formatted player statistics for display
     */
    static formatPlayerStats(stats: PlayerStats): Record<string, string> {
        const totalAnswers = stats.correctAnswers + stats.incorrectAnswers;
        const correctPercent = totalAnswers > 0 ? Math.round((stats.correctAnswers / totalAnswers) * 100) : 0;
        const winPercent = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
        const buzzSuccessPercent = stats.totalBuzzes > 0 ? Math.round((stats.buzzWins / stats.totalBuzzes) * 100) : 0;
        
        return {
            'Games Played': stats.gamesPlayed.toString(),
            'Games Won': `${stats.gamesWon} (${winPercent}%)`,
            'Correct Answers': `${stats.correctAnswers} (${correctPercent}%)`,
            'Buzz Success': `${stats.buzzWins}/${stats.totalBuzzes} (${buzzSuccessPercent}%)`,
            'Average Buzz Time': `${Math.round(stats.averageBuzzTimeMs)}ms`,
            'Fastest Buzz': stats.fastestBuzzMs < Infinity ? `${Math.round(stats.fastestBuzzMs)}ms` : 'N/A',
            'Longest Win Streak': stats.longestWinStreak.toString(),
            'Current Streak': stats.currentStreak.toString(),
            'Highest Score': `$${stats.highestSingleGameScore}`,
            'Daily Doubles Won': stats.dailyDoublesWon.toString(),
            'Final Round Wins': stats.finalRoundWins.toString()
        };
    }

    /**
     * Reset global leaderboards (admin function)
     */
    static async resetGlobalLeaderboards(): Promise<void> {
        const leaderboardTypes: LeaderboardType[] = [
            'mostWins', 'highestScore', 'bestCorrectPercent', 
            'fastestBuzz', 'longestStreak', 'mostGames'
        ];
        
        for (const type of leaderboardTypes) {
            try {
                const leaderboardKey = `leaderboard:${type}`;
                await PersistenceManager.instance.setGlobalData(leaderboardKey, { entries: [] });
            } catch (error) {
                console.error(`Failed to reset leaderboard ${type}:`, error);
            }
        }
    }
}

// Export commonly used functions
export const getPlayerStats = PersistenceManager_Clueboard.getPlayerStats;
export const updatePlayerStats = PersistenceManager_Clueboard.updatePlayerStats;
export const getGlobalLeaderboard = PersistenceManager_Clueboard.getGlobalLeaderboard;
export const getPlayerRanking = PersistenceManager_Clueboard.getPlayerRanking;
export const formatPlayerStats = PersistenceManager_Clueboard.formatPlayerStats;