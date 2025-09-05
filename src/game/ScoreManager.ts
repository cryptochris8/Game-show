// ScoreManager - Handles scoring logic and persistence hooks for Clueboard
// Integrates with HYTOPIA player persistence and manages game scoring

import { Player } from 'hytopia';
import type { PlayerData, GameStateData } from '../net/Events';
import { PersistenceManager_Clueboard } from '../util/Persistence';
import type { GameSession, PlayerStats } from '../util/Persistence';

export interface ScoreChangeEvent {
    playerId: string;
    playerName: string;
    oldScore: number;
    newScore: number;
    delta: number;
    reason: 'correct' | 'incorrect' | 'daily_double' | 'final_round';
    clueValue?: number;
    wager?: number;
}

export interface GameScoreState {
    players: Map<string, PlayerData>;
    scoreHistory: ScoreChangeEvent[];
    gameSessions: Map<string, GameSession>;
    startTime: number;
    endTime?: number;
}

export class ScoreManager {
    private gameState: GameScoreState;
    private buzzWinTimes: Map<string, number[]> = new Map(); // Track buzz times per player

    constructor() {
        this.gameState = {
            players: new Map(),
            scoreHistory: [],
            gameSessions: new Map(),
            startTime: Date.now()
        };
    }

    /**
     * Initialize a player's score and session tracking
     */
    async initializePlayer(player: Player): Promise<PlayerData> {
        // Get player's historical stats for context
        const stats = await PersistenceManager_Clueboard.getPlayerStats(player);
        
        const playerData: PlayerData = {
            id: player.id,
            name: player.username,
            score: 0,
            stats: {
                correctAnswers: 0,
                incorrectAnswers: 0,
                buzzWins: 0,
                averageBuzzTime: 0,
                currentStreak: 0
            }
        };

        // Initialize game session
        const gameSession: GameSession = {
            playerId: player.id,
            startTime: Date.now(),
            score: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            buzzes: 0,
            buzzWins: 0,
            buzzTimes: [],
            dailyDoubleAttempts: 0,
            dailyDoubleWins: 0,
            finalRoundWager: 0,
            finalRoundCorrect: false,
            won: false,
            streak: 0
        };

        this.gameState.players.set(player.id, playerData);
        this.gameState.gameSessions.set(player.id, gameSession);
        this.buzzWinTimes.set(player.id, []);

        return playerData;
    }

    /**
     * Apply correct answer scoring
     */
    applyCorrectAnswer(playerId: string, value: number, isDailyDouble: boolean = false, wager?: number): ScoreChangeEvent | null {
        const player = this.gameState.players.get(playerId);
        const session = this.gameState.gameSessions.get(playerId);
        
        if (!player || !session) {
            console.error(`Player ${playerId} not found in score manager`);
            return null;
        }

        const scoreChange = isDailyDouble && wager !== undefined ? wager : value;
        const oldScore = player.score;
        const newScore = oldScore + scoreChange;

        // Update player score and stats
        player.score = newScore;
        player.stats.correctAnswers++;
        player.stats.currentStreak++;

        // Update session
        session.score = newScore;
        session.correctAnswers++;
        session.streak = Math.max(session.streak, player.stats.currentStreak);
        
        if (isDailyDouble) {
            session.dailyDoubleWins++;
        }

        // Create score change event
        const scoreChangeEvent: ScoreChangeEvent = {
            playerId,
            playerName: player.name,
            oldScore,
            newScore,
            delta: scoreChange,
            reason: isDailyDouble ? 'daily_double' : 'correct',
            clueValue: value,
            wager: isDailyDouble ? wager : undefined
        };

        this.gameState.scoreHistory.push(scoreChangeEvent);
        this.gameState.players.set(playerId, player);
        this.gameState.gameSessions.set(playerId, session);

        return scoreChangeEvent;
    }

    /**
     * Apply incorrect answer penalty
     */
    applyIncorrectAnswer(playerId: string, value: number, isDailyDouble: boolean = false, wager?: number): ScoreChangeEvent | null {
        const player = this.gameState.players.get(playerId);
        const session = this.gameState.gameSessions.get(playerId);
        
        if (!player || !session) {
            console.error(`Player ${playerId} not found in score manager`);
            return null;
        }

        const scoreChange = isDailyDouble && wager !== undefined ? -wager : -value;
        const oldScore = player.score;
        const newScore = oldScore + scoreChange;

        // Update player score and stats
        player.score = newScore;
        player.stats.incorrectAnswers++;
        player.stats.currentStreak = 0; // Reset streak on incorrect answer

        // Update session
        session.score = newScore;
        session.incorrectAnswers++;
        session.streak = Math.max(session.streak, player.stats.currentStreak);

        // Create score change event
        const scoreChangeEvent: ScoreChangeEvent = {
            playerId,
            playerName: player.name,
            oldScore,
            newScore,
            delta: scoreChange,
            reason: isDailyDouble ? 'daily_double' : 'incorrect',
            clueValue: value,
            wager: isDailyDouble ? wager : undefined
        };

        this.gameState.scoreHistory.push(scoreChangeEvent);
        this.gameState.players.set(playerId, player);
        this.gameState.gameSessions.set(playerId, session);

        return scoreChangeEvent;
    }

    /**
     * Apply Final Round scoring
     */
    applyFinalRound(playerId: string, wager: number, correct: boolean): ScoreChangeEvent | null {
        const player = this.gameState.players.get(playerId);
        const session = this.gameState.gameSessions.get(playerId);
        
        if (!player || !session) {
            console.error(`Player ${playerId} not found in score manager`);
            return null;
        }

        const scoreChange = correct ? wager : -wager;
        const oldScore = player.score;
        const newScore = oldScore + scoreChange;

        // Update player score and stats
        player.score = newScore;
        if (correct) {
            player.stats.correctAnswers++;
            player.stats.currentStreak++;
        } else {
            player.stats.incorrectAnswers++;
            player.stats.currentStreak = 0;
        }

        // Update session
        session.score = newScore;
        session.finalRoundWager = wager;
        session.finalRoundCorrect = correct;
        if (correct) {
            session.correctAnswers++;
        } else {
            session.incorrectAnswers++;
        }

        // Create score change event
        const scoreChangeEvent: ScoreChangeEvent = {
            playerId,
            playerName: player.name,
            oldScore,
            newScore,
            delta: scoreChange,
            reason: 'final_round',
            wager
        };

        this.gameState.scoreHistory.push(scoreChangeEvent);
        this.gameState.players.set(playerId, player);
        this.gameState.gameSessions.set(playerId, session);

        return scoreChangeEvent;
    }

    /**
     * Record a buzz attempt (for statistics)
     */
    recordBuzz(playerId: string, buzzTimeMs: number): void {
        const session = this.gameState.gameSessions.get(playerId);
        if (session) {
            session.buzzes++;
            session.buzzTimes.push(buzzTimeMs);
            this.gameState.gameSessions.set(playerId, session);
        }

        // Track buzz times for averaging
        const buzzTimes = this.buzzWinTimes.get(playerId) || [];
        buzzTimes.push(buzzTimeMs);
        this.buzzWinTimes.set(playerId, buzzTimes);
    }

    /**
     * Record a successful buzz (won the buzz-in)
     */
    recordBuzzWin(playerId: string, buzzTimeMs: number): void {
        const player = this.gameState.players.get(playerId);
        const session = this.gameState.gameSessions.get(playerId);
        
        if (player && session) {
            player.stats.buzzWins++;
            session.buzzWins++;
            
            // Update average buzz time
            const buzzTimes = this.buzzWinTimes.get(playerId) || [];
            player.stats.averageBuzzTime = buzzTimes.length > 0 ? 
                buzzTimes.reduce((sum, time) => sum + time, 0) / buzzTimes.length : buzzTimeMs;

            this.gameState.players.set(playerId, player);
            this.gameState.gameSessions.set(playerId, session);
        }
    }

    /**
     * Record Daily Double attempt (for statistics)
     */
    recordDailyDoubleAttempt(playerId: string): void {
        const session = this.gameState.gameSessions.get(playerId);
        if (session) {
            session.dailyDoubleAttempts++;
            this.gameState.gameSessions.set(playerId, session);
        }
    }

    /**
     * Get current scores for all players
     */
    getCurrentScores(): PlayerData[] {
        return Array.from(this.gameState.players.values()).sort((a, b) => b.score - a.score);
    }

    /**
     * Get player by ID
     */
    getPlayer(playerId: string): PlayerData | undefined {
        return this.gameState.players.get(playerId);
    }

    /**
     * Get winner(s) - handles ties
     */
    getWinners(): PlayerData[] {
        const sortedPlayers = this.getCurrentScores();
        if (sortedPlayers.length === 0) return [];
        
        const highestScore = sortedPlayers[0].score;
        return sortedPlayers.filter(player => player.score === highestScore);
    }

    /**
     * Get score history
     */
    getScoreHistory(): ScoreChangeEvent[] {
        return [...this.gameState.scoreHistory];
    }

    /**
     * Calculate game statistics
     */
    getGameStatistics(): {
        totalClues: number;
        averageScore: number;
        highestScore: number;
        lowestScore: number;
        totalCorrectAnswers: number;
        totalIncorrectAnswers: number;
        gameTimeMs: number;
    } {
        const players = this.getCurrentScores();
        const gameTimeMs = (this.gameState.endTime || Date.now()) - this.gameState.startTime;

        return {
            totalClues: this.gameState.scoreHistory.length,
            averageScore: players.length > 0 ? players.reduce((sum, p) => sum + p.score, 0) / players.length : 0,
            highestScore: players.length > 0 ? Math.max(...players.map(p => p.score)) : 0,
            lowestScore: players.length > 0 ? Math.min(...players.map(p => p.score)) : 0,
            totalCorrectAnswers: players.reduce((sum, p) => sum + p.stats.correctAnswers, 0),
            totalIncorrectAnswers: players.reduce((sum, p) => sum + p.stats.incorrectAnswers, 0),
            gameTimeMs
        };
    }

    /**
     * End the game and save all player statistics to persistence
     */
    async endGame(): Promise<void> {
        this.gameState.endTime = Date.now();
        
        // Determine winners
        const winners = this.getWinners();
        const winnerIds = new Set(winners.map(w => w.id));

        // Update sessions with final results
        for (const [playerId, session] of this.gameState.gameSessions.entries()) {
            session.endTime = this.gameState.endTime;
            session.won = winnerIds.has(playerId);
        }

        // Save statistics for all players
        const savePromises: Promise<void>[] = [];
        
        for (const [playerId, session] of this.gameState.gameSessions.entries()) {
            // We need the actual Player object to save persistence data
            // This would be passed from the GameManager when calling endGame
            const savePromise = this.savePlayerSession(playerId, session);
            savePromises.push(savePromise);
        }

        await Promise.allSettled(savePromises);
    }

    /**
     * Save a player's session data (requires Player object)
     * This method should be called by GameManager which has access to Player objects
     */
    async savePlayerSessionWithPlayerObject(player: Player, session: GameSession): Promise<void> {
        try {
            await PersistenceManager_Clueboard.updatePlayerStats(player, session);
        } catch (error) {
            console.error(`Failed to save session for player ${player.username}:`, error);
        }
    }

    /**
     * Private method to handle session saving (placeholder - needs Player object)
     */
    private async savePlayerSession(playerId: string, session: GameSession): Promise<void> {
        // This is a placeholder - the actual saving needs to be done by GameManager
        // which has access to Player objects
        console.log(`Session complete for player ${playerId}:`, {
            score: session.score,
            correct: session.correctAnswers,
            incorrect: session.incorrectAnswers,
            won: session.won
        });
    }

    /**
     * Reset the score manager for a new game
     */
    reset(): void {
        this.gameState = {
            players: new Map(),
            scoreHistory: [],
            gameSessions: new Map(),
            startTime: Date.now()
        };
        this.buzzWinTimes.clear();
    }

    /**
     * Get formatted score display for UI
     */
    getFormattedScores(): Array<{ name: string; score: string; position: number }> {
        return this.getCurrentScores().map((player, index) => ({
            name: player.name,
            score: `$${player.score}`,
            position: index + 1
        }));
    }

    /**
     * Calculate maximum allowed wager for Daily Double or Final Round
     */
    calculateMaxWager(playerId: string, clueValue: number = 1000): number {
        const player = this.gameState.players.get(playerId);
        if (!player) return clueValue;
        
        // Standard Jeopardy rule: wager up to max(clue value, player's score)
        return Math.max(clueValue, player.score, 5); // Minimum wager of $5
    }

    /**
     * Validate a wager amount
     */
    validateWager(playerId: string, wager: number, clueValue: number = 1000): { valid: boolean; reason?: string; maxAllowed?: number } {
        if (!Number.isInteger(wager) || wager < 5) {
            return { valid: false, reason: 'Wager must be at least $5' };
        }

        const maxWager = this.calculateMaxWager(playerId, clueValue);
        
        if (wager > maxWager) {
            return { 
                valid: false, 
                reason: `Wager cannot exceed $${maxWager}`, 
                maxAllowed: maxWager 
            };
        }

        return { valid: true };
    }

    /**
     * Get player's game session (for debugging/admin)
     */
    getPlayerSession(playerId: string): GameSession | undefined {
        return this.gameState.gameSessions.get(playerId);
    }
}

export default ScoreManager;