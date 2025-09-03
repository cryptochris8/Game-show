// GameManager - Main server state machine for Clueboard trivia game
// Coordinates all systems and manages game flow using HYTOPIA SDK

import { Player, PlayerManager, World, PlayerUIEvent } from 'hytopia';
import { 
    ClueboardEvent, 
    GamePhase, 
    GameStateData, 
    PlayerData,
    createServerEvent,
    SelectCellPayload,
    BuzzPayload,
    AnswerSubmitPayload,
    DailyDoubleWagerPayload,
    FinalWagerPayload,
    FinalAnswerPayload,
    MIN_PLAYERS,
    MAX_PLAYERS,
    EventData
} from '../net/Events';
import BuzzManager from './BuzzManager';
import ScoreManager from './ScoreManager';
import RoundManager from './RoundManager';
import PackLoader, { LoadResult } from './PackLoader';
import { AnswerNormalizer } from './Normalize';

export interface GameConfig {
    packName?: string;
    hostPlayerId?: string;
    autoStart: boolean;
    autoHostDelay: number; // ms to wait before auto-hosting
}

export interface FinalRoundState {
    phase: 'wager' | 'answer' | 'results';
    wagers: Map<string, number>;
    answers: Map<string, string>;
    results: Map<string, { correct: boolean; scoreChange: number }>;
    category: string;
    clue: string;
    correctAnswer: string;
}

export class GameManager {
    private world: World;
    private gamePhase: GamePhase = GamePhase.LOBBY;
    private players: Map<string, Player> = new Map();
    private hostPlayerId: string | null = null;
    private currentPickerId: string | null = null;
    
    private scoreManager: ScoreManager;
    private buzzManager: BuzzManager;
    private roundManager: RoundManager | null = null;
    private finalRoundState: FinalRoundState | null = null;
    
    private gameConfig: GameConfig;
    private gameStartTime: number = 0;
    private autoHostTimeout: NodeJS.Timeout | null = null;
    
    // Game timers
    private clueTimer: NodeJS.Timeout | null = null;
    private wagerTimer: NodeJS.Timeout | null = null;
    
    constructor(world: World, config: Partial<GameConfig> = {}) {
        this.world = world;
        this.gameConfig = {
            packName: 'trivia_pack',
            autoStart: true,
            autoHostDelay: 10000,
            ...config
        };
        
        this.scoreManager = new ScoreManager();
        this.buzzManager = new BuzzManager();
        
        this.setupEventHandlers();
    }

    /**
     * Setup HYTOPIA event handlers for player join/leave and UI communication
     */
    private setupEventHandlers(): void {
        // Handle players joining
        this.world.on('playerJoined', this.handlePlayerJoined.bind(this));
        
        // Handle players leaving  
        this.world.on('playerLeft', this.handlePlayerLeft.bind(this));
    }

    /**
     * Handle player joining the game
     */
    private async handlePlayerJoined(player: Player): Promise<void> {
        console.log(`Player ${player.username} joined the game`);
        
        // Add to players list
        this.players.set(player.id, player);
        
        // Initialize player in score manager
        await this.scoreManager.initializePlayer(player);
        
        // Load UI for the player
        player.ui.load('ui/overlay.html');
        
        // Send player their ID for client-side identification
        player.ui.sendData(createServerEvent(ClueboardEvent.GAME_STATE, { 
            type: 'PLAYER_ID', 
            payload: player.id 
        }));
        
        // Setup UI event handling for this player
        player.ui.on(PlayerUIEvent.DATA, ({ data }) => {
            this.handlePlayerUIData(player, data);
        });
        
        // Auto-assign host if none exists
        if (!this.hostPlayerId && this.players.size === 1) {
            this.assignHost(player.id);
        }
        
        // Check if we can start the game
        this.checkAutoStart();
        
        // Send current game state to new player
        await this.broadcastGameState();
        
        // Send welcome message
        this.sendPlayerMessage(player, 'Welcome to Clueboard! Waiting for more players...', '#00FF00');
    }

    /**
     * Handle player leaving the game
     */
    private async handlePlayerLeft(player: Player): Promise<void> {
        console.log(`Player ${player.username} left the game`);
        
        this.players.delete(player.id);
        
        // Handle host leaving
        if (this.hostPlayerId === player.id) {
            this.reassignHost();
        }
        
        // Handle current picker leaving during game
        if (this.currentPickerId === player.id && this.gamePhase !== GamePhase.LOBBY) {
            this.assignNextPicker();
        }
        
        // Check if we need to pause/end the game
        if (this.players.size < MIN_PLAYERS && this.gamePhase !== GamePhase.LOBBY) {
            await this.handleInsufficientPlayers();
        }
        
        await this.broadcastGameState();
    }

    /**
     * Handle UI data from players
     */
    private async handlePlayerUIData(player: Player, data: any): Promise<void> {
        if (!data || !data.type) return;
        
        console.log(`Received ${data.type} from ${player.username}:`, data.payload);
        
        try {
            switch (data.type) {
                case ClueboardEvent.SELECT_CELL:
                    await this.handleCellSelection(player, data.payload as SelectCellPayload);
                    break;
                    
                case ClueboardEvent.BUZZ:
                    await this.handleBuzz(player, data.payload as BuzzPayload);
                    break;
                    
                case ClueboardEvent.ANSWER_SUBMIT:
                    await this.handleAnswerSubmit(player, data.payload as AnswerSubmitPayload);
                    break;
                    
                case ClueboardEvent.DAILY_DOUBLE_WAGER:
                    await this.handleDailyDoubleWager(player, data.payload as DailyDoubleWagerPayload);
                    break;
                    
                case ClueboardEvent.FINAL_WAGER:
                    await this.handleFinalWager(player, data.payload as FinalWagerPayload);
                    break;
                    
                case ClueboardEvent.FINAL_ANSWER:
                    await this.handleFinalAnswer(player, data.payload as FinalAnswerPayload);
                    break;
                    
                default:
                    console.warn(`Unknown event type: ${data.type}`);
            }
        } catch (error) {
            console.error(`Error handling ${data.type} from ${player.username}:`, error);
        }
    }

    /**
     * Start the game
     */
    async startGame(): Promise<void> {
        if (this.gamePhase !== GamePhase.LOBBY) {
            console.warn('Cannot start game - not in lobby phase');
            return;
        }
        
        if (this.players.size < MIN_PLAYERS) {
            console.warn(`Cannot start game - need at least ${MIN_PLAYERS} players`);
            return;
        }
        
        console.log('Starting Clueboard game...');
        
        // Load the trivia pack
        const packResult = await PackLoader.loadDefaultPack();
        if (!packResult.success || !packResult.boardData) {
            console.error('Failed to load trivia pack:', packResult.error);
            this.broadcastMessage('Failed to load trivia pack. Please try again.');
            return;
        }
        
        // Initialize game systems
        this.roundManager = new RoundManager(packResult.boardData);
        this.gameStartTime = Date.now();
        this.gamePhase = GamePhase.ROUND1;
        
        // Pick random starting player
        this.assignRandomPicker();
        
        // Reset buzz manager for new game
        this.buzzManager.reset();
        
        await this.broadcastGameState();
        this.broadcastMessage('Game started! Round 1 begins now.');
        
        console.log('Game started successfully');
    }

    /**
     * Handle cell selection
     */
    private async handleCellSelection(player: Player, payload: SelectCellPayload): Promise<void> {
        // Check if player can select (is host or current picker)
        if (this.currentPickerId !== player.id && this.hostPlayerId !== player.id) {
            return;
        }
        
        if (!this.roundManager || this.gamePhase === GamePhase.FINAL) {
            return;
        }
        
        const result = this.roundManager.selectCell(payload.category, payload.index, player.id);
        
        if (!result.success) {
            this.sendPlayerMessage(player, result.error || 'Invalid cell selection');
            return;
        }
        
        // Reveal the clue
        await this.revealClue(result.clue!);
    }

    /**
     * Reveal a clue to all players
     */
    private async revealClue(clue: any): Promise<void> {
        if (!this.roundManager) return;
        
        const categoryName = this.roundManager.getCategoryName(clue.category);
        
        // Send clue reveal event
        const clueRevealData = {
            category: categoryName,
            value: clue.clue.value,
            text: clue.clue.clue,
            isDailyDouble: clue.isDailyDouble,
            pickerId: clue.pickerId,
            maxWager: clue.isDailyDouble ? this.scoreManager.calculateMaxWager(clue.pickerId!, clue.clue.value) : undefined,
            lockoutMs: 300,
            buzzWindowMs: 12000
        };
        
        this.broadcastEvent(ClueboardEvent.CLUE_REVEAL, clueRevealData);
        
        if (clue.isDailyDouble) {
            // Handle Daily Double - only picker can answer
            this.scoreManager.recordDailyDoubleAttempt(clue.pickerId!);
            // Wait for wager before proceeding
        } else {
            // Start buzz window
            this.buzzManager.startBuzzWindow();
            
            // Set timer for clue timeout
            this.clueTimer = setTimeout(() => {
                this.handleClueTimeout();
            }, 15000);
        }
    }

    /**
     * Handle buzz attempts
     */
    private async handleBuzz(player: Player, payload: BuzzPayload): Promise<void> {
        const result = this.buzzManager.processBuzz(player, payload.timestamp);
        
        // Record the buzz attempt
        this.scoreManager.recordBuzz(player.id, payload.timestamp);
        
        if (result.success && result.winnerId) {
            // Player won the buzz
            this.scoreManager.recordBuzzWin(result.winnerId, result.buzzTime!);
            
            // Cancel clue timer
            if (this.clueTimer) {
                clearTimeout(this.clueTimer);
                this.clueTimer = null;
            }
            
            // Send buzz result
            this.broadcastEvent(ClueboardEvent.BUZZ_RESULT, {
                winnerId: result.winnerId,
                winnerName: result.winnerName!,
                buzzTime: result.buzzTime!,
                lockedPlayers: result.lockedPlayers
            });
            
            // Start answer timer
            this.startAnswerTimer(result.winnerId);
        }
    }

    /**
     * Handle answer submission
     */
    private async handleAnswerSubmit(player: Player, payload: AnswerSubmitPayload): Promise<void> {
        const currentClue = this.roundManager?.getCurrentClue();
        if (!currentClue) return;
        
        // Validate player can answer
        const currentWinner = this.buzzManager.getCurrentWinner();
        if (currentClue.isDailyDouble && currentClue.pickerId !== player.id) return;
        if (!currentClue.isDailyDouble && currentWinner !== player.id) return;
        
        // Check answer
        const matchResult = AnswerNormalizer.checkMatch(payload.answer, currentClue.clue.answer);
        const isCorrect = matchResult.isMatch;
        
        // Apply scoring
        let scoreChange;
        if (currentClue.isDailyDouble && currentClue.wager !== undefined) {
            scoreChange = isCorrect ? 
                this.scoreManager.applyCorrectAnswer(player.id, currentClue.clue.value, true, currentClue.wager) :
                this.scoreManager.applyIncorrectAnswer(player.id, currentClue.clue.value, true, currentClue.wager);
        } else {
            scoreChange = isCorrect ?
                this.scoreManager.applyCorrectAnswer(player.id, currentClue.clue.value) :
                this.scoreManager.applyIncorrectAnswer(player.id, currentClue.clue.value);
        }
        
        // Send judge result
        this.broadcastEvent(ClueboardEvent.JUDGE, {
            playerId: player.id,
            playerName: player.username,
            answer: payload.answer,
            correct: isCorrect,
            correctAnswer: currentClue.clue.answer,
            scoreChange: scoreChange?.delta || 0,
            newScore: scoreChange?.newScore || 0
        });
        
        if (isCorrect) {
            // Correct answer - picker gets control
            this.currentPickerId = player.id;
            this.roundManager.clearCurrentClue();
            this.buzzManager.closeBuzzWindow();
            
            await this.checkRoundComplete();
        } else {
            // Wrong answer - lock player and continue
            this.buzzManager.lockPlayer(player.id);
            
            if (currentClue.isDailyDouble) {
                // Daily Double wrong answer - end clue
                this.currentPickerId = this.assignNextPicker() || this.currentPickerId;
                this.roundManager.clearCurrentClue();
                await this.checkRoundComplete();
            } else {
                // Continue buzz window for other players
                if (this.buzzManager.isBuzzWindowActive()) {
                    this.startAnswerTimer(null); // Continue buzz window
                } else {
                    // No one else can buzz - reveal answer and continue
                    await this.handleClueTimeout();
                }
            }
        }
        
        await this.broadcastGameState();
    }

    /**
     * Handle Daily Double wager
     */
    private async handleDailyDoubleWager(player: Player, payload: DailyDoubleWagerPayload): Promise<void> {
        const currentClue = this.roundManager?.getCurrentClue();
        if (!currentClue || !currentClue.isDailyDouble || currentClue.pickerId !== player.id) {
            return;
        }
        
        // Validate wager
        const validation = this.scoreManager.validateWager(player.id, payload.wager, currentClue.clue.value);
        if (!validation.valid) {
            this.sendPlayerMessage(player, validation.reason || 'Invalid wager');
            return;
        }
        
        // Set wager on clue
        currentClue.wager = payload.wager;
        
        // Now reveal clue for answering (Daily Double doesn't use buzz system)
        this.startAnswerTimer(player.id);
    }

    /**
     * Handle Final Round wager
     */
    private async handleFinalWager(player: Player, payload: FinalWagerPayload): Promise<void> {
        if (!this.finalRoundState || this.finalRoundState.phase !== 'wager') return;
        
        // Validate wager
        const maxWager = this.scoreManager.calculateMaxWager(player.id, 1000);
        if (payload.wager < 0 || payload.wager > maxWager) {
            this.sendPlayerMessage(player, `Invalid wager. Must be between $0 and $${maxWager}`);
            return;
        }
        
        this.finalRoundState.wagers.set(player.id, payload.wager);
        
        // Check if all players have wagered
        if (this.finalRoundState.wagers.size === this.players.size) {
            this.finalRoundState.phase = 'answer';
            
            // Reveal Final Round clue
            this.broadcastEvent(ClueboardEvent.FINAL_ROUND, {
                phase: 'answer',
                clue: this.finalRoundState.clue,
                timeLimit: 30000
            });
            
            // Start answer timer
            this.wagerTimer = setTimeout(() => {
                this.finalizeFinalRound();
            }, 30000);
        }
    }

    /**
     * Handle Final Round answer
     */
    private async handleFinalAnswer(player: Player, payload: FinalAnswerPayload): Promise<void> {
        if (!this.finalRoundState || this.finalRoundState.phase !== 'answer') return;
        
        this.finalRoundState.answers.set(player.id, payload.answer);
        
        // Check if all players have answered
        if (this.finalRoundState.answers.size === this.players.size) {
            await this.finalizeFinalRound();
        }
    }

    /**
     * Check if current round is complete and handle progression
     */
    private async checkRoundComplete(): Promise<void> {
        if (!this.roundManager) return;
        
        if (this.roundManager.isRoundComplete()) {
            const roundInfo = this.roundManager.getRoundCompleteInfo();
            
            if (roundInfo.hasNextRound) {
                // Advance to next round
                this.roundManager.advanceToNextRound();
                this.gamePhase = GamePhase.ROUND2;
                this.broadcastMessage('Round 1 complete! Starting Round 2 with doubled values.');
            } else {
                // Start Final Round
                await this.startFinalRound();
            }
            
            await this.broadcastGameState();
        }
    }

    /**
     * Start Final Round
     */
    private async startFinalRound(): Promise<void> {
        this.gamePhase = GamePhase.FINAL;
        
        // Load pack for Final Round data
        const packResult = await PackLoader.loadDefaultPack();
        if (!packResult.success || !packResult.finalRound) {
            console.error('Failed to load Final Round data');
            return;
        }
        
        this.finalRoundState = {
            phase: 'wager',
            wagers: new Map(),
            answers: new Map(),
            results: new Map(),
            category: packResult.finalRound.category,
            clue: packResult.finalRound.clue,
            correctAnswer: packResult.finalRound.answer
        };
        
        // Send Final Round start event
        this.broadcastEvent(ClueboardEvent.FINAL_ROUND, {
            phase: 'wager',
            category: this.finalRoundState.category,
            maxWager: 1000 // Will be calculated per player
        });
        
        this.broadcastMessage('Final Round! Place your wagers.');
    }

    /**
     * Finalize Final Round results
     */
    private async finalizeFinalRound(): Promise<void> {
        if (!this.finalRoundState) return;
        
        if (this.wagerTimer) {
            clearTimeout(this.wagerTimer);
            this.wagerTimer = null;
        }
        
        // Score all players
        for (const [playerId, wager] of this.finalRoundState.wagers) {
            const answer = this.finalRoundState.answers.get(playerId) || '';
            const matchResult = AnswerNormalizer.checkMatch(answer, this.finalRoundState.correctAnswer);
            const correct = matchResult.isMatch;
            
            const scoreChange = this.scoreManager.applyFinalRound(playerId, wager, correct);
            
            this.finalRoundState.results.set(playerId, {
                correct,
                scoreChange: scoreChange?.delta || 0
            });
        }
        
        this.finalRoundState.phase = 'results';
        
        // Prepare results for display
        const results = Array.from(this.players.values()).map(player => {
            const wager = this.finalRoundState!.wagers.get(player.id) || 0;
            const answer = this.finalRoundState!.answers.get(player.id) || '';
            const result = this.finalRoundState!.results.get(player.id);
            const playerData = this.scoreManager.getPlayer(player.id)!;
            
            return {
                name: player.username,
                wager,
                answer,
                correct: result?.correct || false,
                scoreChange: result?.scoreChange || 0,
                finalScore: playerData.score
            };
        }).sort((a, b) => b.finalScore - a.finalScore);
        
        // Send Final Round results
        this.broadcastEvent(ClueboardEvent.FINAL_REVEAL, { results });
        
        // End game
        await this.endGame();
    }

    /**
     * End the current game
     */
    private async endGame(): Promise<void> {
        this.gamePhase = GamePhase.RESULTS;
        
        // Get winners
        const winners = this.scoreManager.getWinners();
        const finalScores = this.scoreManager.getCurrentScores();
        
        // Save player statistics
        for (const player of this.players.values()) {
            const session = this.scoreManager.getPlayerSession(player.id);
            if (session) {
                await this.scoreManager.savePlayerSessionWithPlayerObject(player, session);
            }
        }
        
        // Send game complete event
        this.broadcastEvent(ClueboardEvent.GAME_COMPLETE, {
            winner: winners[0],
            finalScores,
            gameStats: this.scoreManager.getGameStatistics()
        });
        
        const winnerNames = winners.map(w => w.name).join(', ');
        this.broadcastMessage(`Game Over! Winner${winners.length > 1 ? 's' : ''}: ${winnerNames}`);
        
        // Reset for next game after delay
        setTimeout(() => {
            this.resetGame();
        }, 30000);
    }

    /**
     * Reset game state for new game
     */
    private resetGame(): void {
        this.gamePhase = GamePhase.LOBBY;
        this.currentPickerId = null;
        this.roundManager = null;
        this.finalRoundState = null;
        
        this.scoreManager.reset();
        this.buzzManager.reset();
        
        // Clear all timers
        if (this.clueTimer) {
            clearTimeout(this.clueTimer);
            this.clueTimer = null;
        }
        if (this.wagerTimer) {
            clearTimeout(this.wagerTimer);
            this.wagerTimer = null;
        }
        
        this.broadcastGameState();
        this.broadcastMessage('Ready for new game!');
        
        this.checkAutoStart();
    }

    // Helper methods

    private assignHost(playerId: string): void {
        this.hostPlayerId = playerId;
        const player = this.players.get(playerId);
        if (player) {
            this.sendPlayerMessage(player, 'You are now the host! You can start the game when ready.', '#FFD700');
        }
    }

    private reassignHost(): void {
        if (this.players.size > 0) {
            const newHostId = Array.from(this.players.keys())[0];
            this.assignHost(newHostId);
        } else {
            this.hostPlayerId = null;
        }
    }

    private assignRandomPicker(): void {
        const playerIds = Array.from(this.players.keys());
        if (playerIds.length > 0) {
            const randomIndex = Math.floor(Math.random() * playerIds.length);
            this.currentPickerId = playerIds[randomIndex];
        }
    }

    private assignNextPicker(): string | null {
        const playerIds = Array.from(this.players.keys());
        if (playerIds.length === 0) return null;
        
        const currentIndex = playerIds.indexOf(this.currentPickerId || '');
        const nextIndex = (currentIndex + 1) % playerIds.length;
        this.currentPickerId = playerIds[nextIndex];
        return this.currentPickerId;
    }

    private checkAutoStart(): void {
        if (this.gameConfig.autoStart && 
            this.gamePhase === GamePhase.LOBBY && 
            this.players.size >= MIN_PLAYERS && 
            !this.autoHostTimeout) {
            
            this.autoHostTimeout = setTimeout(() => {
                this.startGame();
                this.autoHostTimeout = null;
            }, this.gameConfig.autoHostDelay);
        }
    }

    private async handleInsufficientPlayers(): Promise<void> {
        this.broadcastMessage('Not enough players to continue. Game paused.');
        // Could implement pause/resume logic here
    }

    private handleClueTimeout(): void {
        this.buzzManager.closeBuzzWindow();
        const currentClue = this.roundManager?.getCurrentClue();
        
        if (currentClue) {
            this.broadcastEvent(ClueboardEvent.JUDGE, {
                playerId: '',
                playerName: '',
                answer: '',
                correct: false,
                correctAnswer: currentClue.clue.answer,
                scoreChange: 0,
                newScore: 0
            });
            
            this.roundManager.clearCurrentClue();
            this.checkRoundComplete();
        }
    }

    private startAnswerTimer(playerId: string | null): void {
        // Implementation depends on whether it's a buzz winner or Daily Double
        setTimeout(() => {
            if (playerId) {
                // Time up for specific player
                this.handleClueTimeout();
            }
        }, 30000);
    }

    private async broadcastGameState(): Promise<void> {
        const gameState: GameStateData = {
            phase: this.gamePhase,
            board: this.roundManager?.getCurrentBoard() || null,
            usedCells: this.roundManager?.getUsedCells() || [],
            players: this.scoreManager.getCurrentScores(),
            currentPickerId: this.currentPickerId,
            currentClue: this.roundManager?.getCurrentClue() || null,
            lockoutUntil: 0, // Would be calculated from buzz manager
            buzzWindowEnd: 0, // Would be calculated from buzz manager
            message: this.getStatusMessage(),
            round: this.roundManager?.getCurrentRound() || 1,
            timeRemaining: 0
        };

        this.broadcastEvent(ClueboardEvent.GAME_STATE, { gameState });
    }

    private getStatusMessage(): string {
        switch (this.gamePhase) {
            case GamePhase.LOBBY:
                return `Waiting for players... (${this.players.size}/${MIN_PLAYERS} minimum)`;
            case GamePhase.ROUND1:
                return 'Round 1 in progress';
            case GamePhase.ROUND2:
                return 'Round 2 in progress';
            case GamePhase.FINAL:
                return 'Final Round!';
            case GamePhase.RESULTS:
                return 'Game Complete!';
            default:
                return '';
        }
    }

    private broadcastEvent(type: ClueboardEvent, payload: any): void {
        const eventData = createServerEvent(type, payload);
        
        for (const player of this.players.values()) {
            player.ui.sendData(eventData);
        }
    }

    private broadcastMessage(message: string, color: string = '#FFFFFF'): void {
        for (const player of this.players.values()) {
            this.world.chatManager.sendPlayerMessage(player, message, color);
        }
    }

    private sendPlayerMessage(player: Player, message: string, color: string = '#FFFFFF'): void {
        this.world.chatManager.sendPlayerMessage(player, message, color);
    }
}

export default GameManager;