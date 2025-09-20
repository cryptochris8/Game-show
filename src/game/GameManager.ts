// GameManager - Main server state machine for Buzzchain trivia game
// Coordinates all systems and manages game flow using HYTOPIA SDK

import { Player, PlayerManager, World, PlayerUIEvent } from 'hytopia';
import {
    BuzzchainEvent,
    GamePhase,
    createServerEvent,
    MIN_PLAYERS,
    MAX_PLAYERS
} from '../net/Events';
import type {
    GameStateData,
    PlayerData,
    SelectCellPayload,
    BuzzPayload,
    AnswerSubmitPayload,
    DailyDoubleWagerPayload,
    FinalWagerPayload,
    FinalAnswerPayload,
    EventData
} from '../net/Events';
import BuzzManager from './BuzzManager';
import ScoreManager from './ScoreManager';
import RoundManager from './RoundManager';
import PackLoader from './PackLoader';
import type { LoadResult } from './PackLoader';
import { AnswerNormalizer } from './Normalize';
import { logger } from '../util/Logger';
import { TimerManager } from '../util/TimerManager';
import { InputValidator, rateLimit } from '../util/InputValidator';
import { TIMING, GAME_CONSTANTS, SCORES, BOARD, ERROR_MESSAGES, SUCCESS_MESSAGES, DEFAULT_CONFIG } from '../util/GameConstants';
import AIPlayer, { AI_PERSONALITIES, AIPersonality, AIGameActions } from './AIPlayer';
import PodiumManager from './PodiumManager';
import TalkShowIntroManager from './TalkShowIntroManager';

export interface GameConfig {
    packName?: string;
    hostPlayerId?: string;
    autoStart: boolean;
    autoHostDelay: number; // ms to wait before auto-hosting
    singlePlayerMode?: boolean;
    aiPlayersCount?: number;
    skipIntro?: boolean; // Skip the talk show introduction
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
    private aiPlayers: Map<string, AIPlayer> = new Map();
    private hostPlayerId: string | null = null;
    private currentPickerId: string | null = null;

    private scoreManager: ScoreManager;
    private buzzManager: BuzzManager;
    private roundManager: RoundManager | null = null;
    private podiumManager: PodiumManager;
    private talkShowIntroManager: TalkShowIntroManager;
    private timerManager: TimerManager;
    private finalRoundState: FinalRoundState | null = null;

    // Timer properties
    private clueTimer: NodeJS.Timeout | null = null;
    private answerTimer: NodeJS.Timeout | null = null;
    private wagerTimer: NodeJS.Timeout | null = null;
    private gameStateUpdateTimer: NodeJS.Timeout | null = null;
    private autoHostTimeout: NodeJS.Timeout | null = null;

    private gameConfig: GameConfig;
    private gameStartTime: number = 0;
    
    constructor(world: World, config: Partial<GameConfig> = {}) {
        this.world = world;
        this.gameConfig = {
            packName: DEFAULT_CONFIG.PACK_NAME,
            autoStart: true,
            autoHostDelay: TIMING.AUTO_HOST_DELAY_MS,
            singlePlayerMode: false,
            aiPlayersCount: GAME_CONSTANTS.SINGLE_PLAYER_AI_COUNT,
            skipIntro: false, // Set to true to skip talk show intro for debugging
            ...config
        };

        this.timerManager = new TimerManager('GameManager');
        this.scoreManager = new ScoreManager();
        this.buzzManager = new BuzzManager();
        this.podiumManager = new PodiumManager(world);
        this.talkShowIntroManager = new TalkShowIntroManager(world, this.podiumManager);

        // Spawn the host NPC immediately
        this.podiumManager.spawnHost();

        // Don't initialize AI players in constructor - wait for explicit call

        this.setupEventHandlers();
    }

    /**
     * Update game configuration
     */
    public updateConfig(newConfig: Partial<GameConfig>): void {
        this.gameConfig = { ...this.gameConfig, ...newConfig };
        logger.info('Game configuration updated', {
            component: 'GameManager',
            config: this.gameConfig
        });
    }

    /**
     * Get current game phase
     */
    public getCurrentGamePhase(): GamePhase {
        return this.gamePhase;
    }

    /**
     * Signal all players to load the game board UI
     */
    private loadGameBoardForAllPlayers(): void {
        logger.info('Signaling all players to load game board after intro completion', {
            component: 'GameManager',
            playerCount: this.players.size
        });

        for (const player of this.players.values()) {
            try {
                player.ui.sendData({
                    type: 'LOAD_GAME_BOARD',
                    payload: {}
                });
            } catch (error) {
                logger.error('Failed to signal game board load to player', error as Error, {
                    component: 'GameManager',
                    playerId: player.id
                });
            }
        }
    }


    /**
     * Retry assigning a player to a podium (called when entity becomes available)
     */
    private retryPlayerPodiumAssignment(playerId: string, podiumNumber: number): void {
        const player = this.players.get(playerId);
        if (player) {
            const assigned = this.podiumManager.assignPlayerToPodium(player, podiumNumber);
            if (assigned) {
                logger.info(`Player ${player.username} successfully assigned to podium ${podiumNumber} on retry`, {
                    component: 'GameManager',
                    playerId: player.id,
                    podiumNumber
                });
            } else {
                logger.warn(`Failed to assign player ${player.username} to podium ${podiumNumber} even on retry`, {
                    component: 'GameManager',
                    playerId: player.id,
                    podiumNumber
                });
            }
        }
    }

    /**
     * Handle UI events from players
     */
    public handleUIEvent(player: Player, data: any): void {
        // Handle game-specific UI events
        logger.debug(`GameManager handling UI event from ${player.username}:`, data);
        // Forward to the existing UI data handler
        this.handlePlayerUIData(player, data);
    }

    /**
     * Initialize AI players for single player mode
     */
    public initializeAIPlayers(count?: number): void {
        try {
            // Always use exactly 2 AI players for single player (3 total with human)
            const aiCount = count || 2;
            const shuffledPersonalities = [...AI_PERSONALITIES].sort(() => Math.random() - 0.5);

        // Create game actions for AI players
        const gameActions: AIGameActions = {
            selectCell: (categoryIndex: number, clueIndex: number, playerId: string) => {
                this.handleAISelCell(categoryIndex, clueIndex, playerId);
            },
            buzz: (playerId: string) => {
                this.handleAIBuzz(playerId);
            },
            submitAnswer: (answer: string, playerId: string, choiceIndex?: number) => {
                this.handleAISubmitAnswer(answer, playerId, choiceIndex);
            },
            submitWager: (wager: number, playerId: string) => {
                this.handleAISubmitWager(wager, playerId);
            },
            submitFinalWager: (wager: number, playerId: string) => {
                this.handleAIFinalWager(wager, playerId);
            },
            submitFinalAnswer: (answer: string, playerId: string) => {
                this.handleAIFinalAnswer(answer, playerId);
            }
        };

        for (let i = 0; i < aiCount; i++) {
            const personality = shuffledPersonalities[i % shuffledPersonalities.length];
            const aiPlayer = new AIPlayer(this.world, personality, gameActions);

            this.aiPlayers.set(aiPlayer.id, aiPlayer);
            this.scoreManager.addPlayer(aiPlayer.id, aiPlayer.username);

            // Assign AI to an available podium
            const podiumNumber = this.podiumManager.getNextAvailablePodium();
            if (podiumNumber && aiPlayer.entity) {
                this.podiumManager.assignAIToPodium(aiPlayer.entity, podiumNumber);
            }

            logger.info(`AI Player initialized: ${aiPlayer.username}`, {
                component: 'GameManager',
                aiPlayerId: aiPlayer.id,
                difficulty: personality.difficulty,
                podiumNumber: podiumNumber
            });
        }

            logger.info(`Initialized ${aiCount} AI players for single player mode`, {
                component: 'GameManager'
            });
        } catch (error) {
            logger.error('Failed to initialize AI players', error as Error, {
                component: 'GameManager',
                aiCount: count
            });
            throw error; // Re-throw as this is critical
        }
    }

    /**
     * Setup HYTOPIA event handlers for player join/leave and UI communication
     */
    private setupEventHandlers(): void {
        try {
            // Handle players joining
            this.world.on('playerJoined', this.handlePlayerJoined.bind(this));

            // Handle players leaving
            this.world.on('playerLeft', this.handlePlayerLeft.bind(this));
        } catch (error) {
            logger.error('Failed to setup event handlers', error as Error, {
                component: 'GameManager',
                critical: true
            });
            throw error; // Re-throw as this is critical
        }
    }

    /**
     * Handle player joining the game
     */
    private async handlePlayerJoined(player: Player): Promise<void> {
        try {
            console.log(`Player ${player.username} joined the game`);

        // Check if we already have 3 players (max for Buzzchain format)
        if (this.players.size >= MAX_PLAYERS) {
            logger.warn(`Game full - cannot add player ${player.username}`, {
                component: 'GameManager',
                currentPlayers: this.players.size,
                maxPlayers: MAX_PLAYERS
            });
            // TODO: Send message to player that game is full
            return;
        }

        // Add to players list
        this.players.set(player.id, player);

        // Initialize player in score manager
        await this.scoreManager.initializePlayer(player);

        // DON'T assign to podium immediately - let players spawn randomly
        // They will be assigned to podiums when the game starts
        logger.info(`Player ${player.username} will be assigned to podium when game starts`, {
            component: 'GameManager',
            playerId: player.id,
            currentPhase: this.gamePhase
        });
        
        // UI loading is now handled by main server - don't load here
        
        // Send player their ID for client-side identification
        player.ui.sendData(createServerEvent(BuzzchainEvent.GAME_STATE, {
            gameState: {
                phase: this.gamePhase,
                board: null,
                usedCells: [],
                players: [],
                currentPickerId: null,
                currentClue: null,
                lockoutUntil: 0,
                buzzWindowEnd: 0,
                message: 'Welcome to Buzzchain - Where knowledge links together!',
                round: 1,
                timeRemaining: 0,
                playerId: player.id // Add player ID to game state
            }
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
            this.sendPlayerMessage(player, '🐝 Welcome to Buzzchain! The Golden Knowledge Chain awaits...', '#FFD700');
        } catch (error) {
            logger.error(`Failed to handle player join for ${player?.username}`, error as Error, {
                component: 'GameManager',
                playerId: player?.id
            });
        }
    }

    /**
     * Handle player leaving the game
     */
    private async handlePlayerLeft(player: Player): Promise<void> {
        try {
            console.log(`Player ${player.username} left the game`);

            // Release player from their podium
            this.podiumManager.releasePlayer(player);

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
        } catch (error) {
            logger.error(`Failed to handle player leave for ${player?.username}`, error as Error, {
                component: 'GameManager',
                playerId: player?.id
            });
        }
    }

    /**
     * Handle UI data from players
     */
    private async handlePlayerUIData(player: Player, data: any): Promise<void> {
        if (!data || !data.type) return;
        
        console.log(`Received ${data.type} from ${player.username}:`, data.payload);
        
        try {
            switch (data.type) {
                case BuzzchainEvent.SELECT_CELL:
                    await this.handleCellSelection(player, data.payload as SelectCellPayload);
                    break;
                    
                case BuzzchainEvent.BUZZ:
                    await this.handleBuzz(player, data.payload as BuzzPayload);
                    break;
                    
                case BuzzchainEvent.ANSWER_SUBMIT:
                    await this.handleAnswerSubmit(player, data.payload as AnswerSubmitPayload);
                    break;
                    
                case BuzzchainEvent.DAILY_DOUBLE_WAGER:
                    await this.handleDailyDoubleWager(player, data.payload as DailyDoubleWagerPayload);
                    break;
                    
                case BuzzchainEvent.FINAL_WAGER:
                    await this.handleFinalWager(player, data.payload as FinalWagerPayload);
                    break;
                    
                case BuzzchainEvent.FINAL_ANSWER:
                    await this.handleFinalAnswer(player, data.payload as FinalAnswerPayload);
                    break;

                case 'SINGLE_PLAYER_ACTIVATE':
                    await this.handleSinglePlayerActivate(player, data.payload);
                    break;

                default:
                    console.warn(`Unknown event type: ${data.type}`);
            }
        } catch (error) {
            console.error(`Error handling ${data.type} from ${player.username}:`, error);
        }
    }

    /**
     * Handle single player mode activation
     */
    private async handleSinglePlayerActivate(player: Player, payload: { aiCount: number }): Promise<void> {
        const aiCount = Math.max(1, Math.min(5, payload.aiCount || 3)); // Ensure valid range

        logger.info(`Player ${player.username} activating single player mode with ${aiCount} AI opponents`, {
            component: 'GameManager',
            playerId: player.id,
            aiCount
        });

        // Update game configuration for single player mode
        this.gameConfig.singlePlayerMode = true;
        this.gameConfig.aiPlayersCount = aiCount;

        // Initialize AI players if not already done
        if (this.aiPlayers.size === 0) {
            this.initializeAIPlayers(aiCount);
        }

        // Send confirmation to player
        this.sendPlayerMessage(player, `🎮 Single player mode activated! Starting game with ${aiCount} AI opponents...`, '#00FF00');

        // Start the game immediately
        try {
            await this.startGame();
            logger.info('Single player game started successfully', {
                component: 'GameManager',
                playerId: player.id,
                aiCount,
                totalPlayers: this.players.size + this.aiPlayers.size
            });
        } catch (error) {
            logger.error('Failed to start single player game', error as Error, {
                component: 'GameManager',
                playerId: player.id,
                aiCount
            });
            this.sendPlayerMessage(player, '❌ Failed to start single player game. Please try again.', '#FF6B6B');
        }
    }

    /**
     * Assign all players to podiums when game starts
     */
    private async assignAllPlayersToPodiums(): Promise<void> {
        logger.info('Assigning all players to podiums at game start', {
            component: 'GameManager',
            humanPlayers: this.players.size,
            aiPlayers: this.aiPlayers.size
        });

        // Assign human players first
        let podiumNumber = 1;
        for (const [playerId, player] of this.players) {
            if (podiumNumber <= 3) {
                const assigned = this.podiumManager.assignPlayerToPodium(player, podiumNumber);
                if (assigned) {
                    logger.info(`Human player ${player.username} assigned to podium ${podiumNumber}`, {
                        component: 'GameManager',
                        playerId,
                        podiumNumber
                    });
                } else {
                    logger.warn(`Failed to assign human player ${player.username} to podium ${podiumNumber}`, {
                        component: 'GameManager',
                        playerId,
                        podiumNumber
                    });
                }
                podiumNumber++;
            }
        }

        // Assign AI players to remaining podiums
        for (const [aiId, aiPlayer] of this.aiPlayers) {
            if (podiumNumber <= 3 && aiPlayer.entity) {
                const assigned = this.podiumManager.assignAIToPodium(aiPlayer.entity, podiumNumber);
                if (assigned) {
                    logger.info(`AI player ${aiPlayer.username} assigned to podium ${podiumNumber}`, {
                        component: 'GameManager',
                        aiId,
                        podiumNumber
                    });
                } else {
                    logger.warn(`Failed to assign AI player ${aiPlayer.username} to podium ${podiumNumber}`, {
                        component: 'GameManager',
                        aiId,
                        podiumNumber
                    });
                }
                podiumNumber++;
            }
        }
    }

    /**
     * Start the game
     */
    async startGame(): Promise<void> {
        try {
            if (this.gamePhase !== GamePhase.LOBBY) {
                console.warn('Cannot start game - not in lobby phase');
                return;
            }

        const totalPlayers = this.players.size + this.aiPlayers.size;
        if (totalPlayers < MIN_PLAYERS) {
            console.warn(`Cannot start game - need at least ${MIN_PLAYERS} players`);
            return;
        }
        
        console.log('🐝 Starting Buzzchain - Buzzy Bee is ready to host!');
        
        // Load the trivia pack
        const packResult = await PackLoader.loadPackByName(this.gameConfig.packName);
        if (!packResult.success || !packResult.boardData) {
            console.error('Failed to load trivia pack:', packResult.error);
            this.broadcastMessage('Failed to load trivia pack. Please try again.');
            return;
        }
        
        // Initialize game systems
        this.roundManager = new RoundManager(packResult.boardData);
        this.gameStartTime = Date.now();

        // NOW assign all players to podiums at game start
        await this.assignAllPlayersToPodiums();

        // Give a short delay to ensure all players are properly positioned at podiums
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Transition to INTRO phase to prevent game board loading during intro
        this.gamePhase = GamePhase.INTRO;
        await this.broadcastGameState();

        // Start with talk show introduction sequence
        logger.info('Starting talk show introduction sequence', {
            component: 'GameManager',
            totalPlayers,
            humanPlayers: this.players.size,
            aiPlayers: this.aiPlayers.size
        });

        try {
            // Start the introduction sequence (can be skipped via config)
            if (this.gameConfig.skipIntro) {
                logger.info('Skipping introduction sequence per config', {
                    component: 'GameManager'
                });
            } else {
                await this.talkShowIntroManager.startIntroSequence(
                    this.players,
                    Array.from(this.aiPlayers.values()),
                    { skipIntro: this.gameConfig.skipIntro }
                );
            }
        } catch (error) {
            logger.error('Introduction sequence failed, continuing to game', error as Error, {
                component: 'GameManager',
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack
            });
            // Skip intro on failure to prevent game from getting stuck
            this.gameConfig.skipIntro = true;
        }

        // After intro completes, transition to game
        this.gamePhase = GamePhase.ROUND1;

        // Ensure all players and host are facing the correct direction after intro
        try {
            this.podiumManager.ensureProperOrientation();
            logger.info('Ensured proper orientation after intro sequence', {
                component: 'GameManager'
            });
        } catch (error) {
            logger.warn('Failed to ensure proper orientation, continuing game', {
                component: 'GameManager',
                error: (error as Error).message
            });
        }

        // Pick random starting player
        try {
            this.assignRandomPicker();
            logger.info('Random picker assigned successfully', {
                component: 'GameManager',
                currentPickerId: this.currentPickerId
            });
        } catch (error) {
            logger.error('Failed to assign random picker', error as Error, {
                component: 'GameManager'
            });
            throw error;
        }

        // Reset buzz manager for new game
        try {
            this.buzzManager.reset();
            logger.debug('Buzz manager reset successfully', {
                component: 'GameManager'
            });
        } catch (error) {
            logger.error('Failed to reset buzz manager', error as Error, {
                component: 'GameManager'
            });
            throw error;
        }

        try {
            await this.broadcastGameState();
            logger.debug('Game state broadcasted successfully', {
                component: 'GameManager'
            });
        } catch (error) {
            logger.error('Failed to broadcast game state', error as Error, {
                component: 'GameManager'
            });
            throw error;
        }

        try {
            this.broadcastMessage('📺 And now... let the trivia begin!', 'FFD700');
            logger.debug('Welcome message broadcasted', {
                component: 'GameManager'
            });
        } catch (error) {
            logger.error('Failed to broadcast welcome message', error as Error, {
                component: 'GameManager'
            });
            // Don't throw for message failures
        }

        // Now that intro is complete, signal players to load game board
        try {
            this.loadGameBoardForAllPlayers();
            logger.info('Game board loaded for all players', {
                component: 'GameManager'
            });
        } catch (error) {
            logger.error('Failed to load game board for players', error as Error, {
                component: 'GameManager'
            });
            throw error;
        }

        // Start AI player update loop if in single player mode
        if (this.gameConfig.singlePlayerMode && this.aiPlayers.size > 0) {
            try {
                this.startAIUpdateLoop();
                logger.info('AI update loop started', {
                    component: 'GameManager'
                });
            } catch (error) {
                logger.error('Failed to start AI update loop', error as Error, {
                    component: 'GameManager'
                });
                // Don't throw for AI loop failures
            }
        }

        logger.info('Game started successfully', {
            component: 'GameManager',
            currentPickerId: this.currentPickerId,
            gamePhase: this.gamePhase
        });
        } catch (error) {
            logger.error('Failed to start game', error as Error, {
                component: 'GameManager',
                critical: true
            });
            this.broadcastMessage('❌ Failed to start game. Please try again.');
            this.gamePhase = GamePhase.LOBBY; // Reset to lobby
            await this.broadcastGameState();
        }
    }

    /**
     * Start AI player update loop
     */
    private startAIUpdateLoop(): void {
        // Clear any existing timer
        if (this.gameStateUpdateTimer) {
            clearInterval(this.gameStateUpdateTimer);
        }

        // Update AI players every 2 seconds with current game state
        this.gameStateUpdateTimer = setInterval(async () => {
            try {
                if (this.gamePhase !== GamePhase.LOBBY && this.gamePhase !== GamePhase.RESULTS) {
                    // Get current game state
                    const currentGameState = await this.getCurrentGameStateForAI();

                    // Update all AI players
                    for (const aiPlayer of this.aiPlayers.values()) {
                        try {
                            aiPlayer.updateGameState(currentGameState);
                        } catch (error) {
                            logger.error('Error updating AI player', error as Error, {
                                component: 'GameManager',
                                aiPlayerId: aiPlayer.id
                            });
                        }
                    }
                }
            } catch (error) {
                logger.error('Error in AI update loop', error as Error, {
                    component: 'GameManager'
                });
            }
        }, 5000); // Update every 5 seconds (give humans more time)

        logger.info('AI player update loop started', {
            component: 'GameManager',
            aiPlayerCount: this.aiPlayers.size,
            updateInterval: 5000
        });
    }

    /**
     * Get current game state for AI decision making
     */
    private async getCurrentGameStateForAI(): Promise<GameStateData> {
        return {
            phase: this.gamePhase,
            board: this.roundManager?.getCurrentBoard() || null,
            usedCells: this.roundManager?.getUsedCells() || [],
            players: [], // AI doesn't need full player list
            currentPickerId: this.currentPickerId,
            currentClue: this.roundManager?.getCurrentClue() || null,
            lockoutUntil: 0, // AI handles timing internally
            buzzWindowEnd: 0, // AI handles timing internally
            message: '',
            round: this.roundManager?.getCurrentRound() || 1,
            timeRemaining: 0
        };
    }

    /**
     * Stop AI update loop
     */
    private stopAIUpdateLoop(): void {
        if (this.gameStateUpdateTimer) {
            clearInterval(this.gameStateUpdateTimer);
            this.gameStateUpdateTimer = null;
            logger.info('AI player update loop stopped', {
                component: 'GameManager'
            });
        }
    }

    /**
     * Send current game state to a specific player
     */
    public sendGameStateToPlayer(player: Player): void {
        // Use getCurrentBoard() which returns the proper structure with categories array
        const boardData = this.roundManager ? this.roundManager.getCurrentBoard() : null;

        const playersData = {};
        this.players.forEach((p, id) => {
            playersData[id] = {
                id: id,
                name: p.username || id,
                score: this.scoreManager.getPlayer(id)?.score || 0,
                hasBuzzed: this.buzzManager?.getCurrentWinner() === id
            };
        });

        // Add AI players
        this.aiPlayers.forEach((ai, id) => {
            playersData[id] = {
                id: id,
                name: ai.username,
                score: ai.score || 0,
                hasBuzzed: this.buzzManager?.getCurrentWinner() === id
            };
        });

        player.ui.sendData({
            type: 'GAME_STATE',
            payload: {
                phase: this.gamePhase,
                round: this.roundManager?.getCurrentRound() || 1,
                board: boardData,
                players: playersData,
                currentPlayer: this.currentPickerId
            }
        });
    }

    /**
     * Handle AI cell selection
     */
    private async handleAISelCell(categoryIndex: number, clueIndex: number, aiPlayerId: string): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for cell selection', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Check if AI can select (is current picker)
        if (this.currentPickerId !== aiPlayerId) {
            logger.warn('AI tried to select cell but is not current picker', {
                component: 'GameManager',
                aiPlayerId,
                currentPickerId: this.currentPickerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: SelectCellPayload = {
            categoryIndex,
            clueIndex
        };

        // Use the existing cell selection logic
        await this.handleCellSelection(aiPlayer, payload);
    }

    /**
     * Handle AI buzz
     */
    private async handleAIBuzz(aiPlayerId: string): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for buzz', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: BuzzPayload = {
            timestamp: Date.now()
        };

        // Use the existing buzz logic
        await this.handleBuzz(aiPlayer as any, payload);
    }

    /**
     * Handle AI answer submission
     */
    private async handleAISubmitAnswer(answer: string, aiPlayerId: string, choiceIndex?: number): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for answer submission', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: AnswerSubmitPayload = {
            answer,
            submitTime: Date.now(),
            choiceIndex: choiceIndex
        };

        // Use the existing answer submission logic
        await this.handleAnswerSubmit(aiPlayer as any, payload);
    }

    /**
     * Handle AI wager submission
     */
    private async handleAISubmitWager(wager: number, aiPlayerId: string): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for wager submission', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: DailyDoubleWagerPayload = {
            wager
        };

        // Use the existing wager logic
        await this.handleDailyDoubleWager(aiPlayer as any, payload);
    }

    /**
     * Handle AI Final Wager submission
     */
    private async handleAIFinalWager(wager: number, aiPlayerId: string): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for final wager submission', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: FinalWagerPayload = {
            wager
        };

        // Use the existing final wager logic
        await this.handleFinalWager(aiPlayer as any, payload);
    }

    /**
     * Handle AI Final Answer submission
     */
    private async handleAIFinalAnswer(answer: string, aiPlayerId: string): Promise<void> {
        const aiPlayer = this.aiPlayers.get(aiPlayerId);
        if (!aiPlayer) {
            logger.error('AI player not found for final answer submission', null, {
                component: 'GameManager',
                aiPlayerId
            });
            return;
        }

        // Create a mock payload for the existing handler
        const payload: FinalAnswerPayload = {
            answer
        };

        // Use the existing final answer logic
        await this.handleFinalAnswer(aiPlayer as any, payload);
    }

    /**
     * Handle cell selection
     */
    private async handleCellSelection(player: Player | AIPlayer, payload: SelectCellPayload): Promise<void> {
        const playerId = typeof player === 'string' ? player : (player as any).id || player.id;

        // Check if player can select (is current picker)
        if (this.currentPickerId !== playerId) {
            logger.warn('Player tried to select cell but is not current picker', {
                component: 'GameManager',
                playerId,
                currentPickerId: this.currentPickerId
            });
            return;
        }
        
        if (!this.roundManager || this.gamePhase === GamePhase.FINAL) {
            return;
        }
        
        // Handle both naming conventions for compatibility
        const categoryIndex = payload.categoryIndex !== undefined ? payload.categoryIndex : payload.category;
        const clueIndex = payload.clueIndex !== undefined ? payload.clueIndex : payload.index;

        const result = this.roundManager.selectCell(categoryIndex, clueIndex, playerId);
        
        if (!result.success) {
            // Only send message to human players
            if (player && typeof player !== 'string' && (player as any).ui) {
                this.sendPlayerMessage(player as Player, result.error || 'Invalid cell selection');
            }
            return;
        }
        
        // Reveal the clue
        await this.revealClue(result.clue!);

        // Broadcast updated game state so UI knows which cells are used
        await this.broadcastGameState();
    }

    /**
     * Reveal a clue to all players
     */
    private async revealClue(clue: any): Promise<void> {
        if (!this.roundManager) return;
        
        const categoryName = this.roundManager.getCategoryName(clue.category);
        
        // Send clue reveal event
        // Update maxWager on the current clue object for AI access
        if (clue.isDailyDouble && clue.pickerId) {
            clue.maxWager = this.scoreManager.calculateMaxWager(clue.pickerId, clue.clue.value);
        }

        const clueRevealData = {
            category: categoryName,
            value: clue.clue.value,
            text: clue.clue.clue,
            isDailyDouble: clue.isDailyDouble,
            pickerId: clue.pickerId,
            maxWager: clue.isDailyDouble ? this.scoreManager.calculateMaxWager(clue.pickerId!, clue.clue.value) : undefined,
            lockoutMs: 300,
            buzzWindowMs: 12000,
            choices: clue.clue.choices,
            correctChoice: clue.clue.correctChoice
        };

        this.broadcastEvent(BuzzchainEvent.CLUE_REVEAL, clueRevealData);
        
        if (clue.isDailyDouble) {
            // Handle Daily Double - only picker can answer
            this.scoreManager.recordDailyDoubleAttempt(clue.pickerId!);
            // Wait for wager before proceeding
        } else {
            // Start buzz window
            this.buzzManager.startBuzzWindow();

            // Set timer for clue timeout (45 seconds for players to buzz in)
            this.clueTimer = setTimeout(() => {
                this.handleClueTimeout();
            }, 45000);
        }
    }

    /**
     * Handle buzz attempts with rate limiting
     */
    private async handleBuzz(player: Player, payload: BuzzPayload): Promise<void> {
        // Validate player ID
        if (!InputValidator.validatePlayerId(player.id)) {
            logger.warn('Invalid player ID in buzz attempt', {
                component: 'GameManager',
                playerId: player.id
            });
            return;
        }

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
            this.broadcastEvent(BuzzchainEvent.BUZZ_RESULT, {
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
     * Handle answer submission with validation
     */
    private async handleAnswerSubmit(player: Player, payload: AnswerSubmitPayload): Promise<void> {
        // Validate and sanitize answer
        const answerValidation = InputValidator.validateAnswer(payload.answer);
        if (!answerValidation.valid) {
            logger.warn('Invalid answer submission', {
                component: 'GameManager',
                playerId: player.id,
                error: answerValidation.error
            });
            this.broadcastEventToPlayer(player, createServerEvent(BuzzchainEvent.ERROR, {
                message: answerValidation.error || ERROR_MESSAGES.INVALID_ANSWER
            }));
            return;
        }

        const currentClue = this.roundManager?.getCurrentClue();
        if (!currentClue) return;

        // Validate player can answer
        const currentWinner = this.buzzManager.getCurrentWinner();
        if (currentClue.isDailyDouble && currentClue.pickerId !== player.id) return;
        if (!currentClue.isDailyDouble && currentWinner !== player.id) return;
        
        // Check answer - support both multiple choice and text input for backward compatibility
        let isCorrect: boolean;

        if (payload.choiceIndex !== undefined && currentClue.clue.correctChoice !== undefined) {
            // Multiple choice answer
            isCorrect = payload.choiceIndex === currentClue.clue.correctChoice;
            logger.info('Multiple choice answer validation', {
                component: 'GameManager',
                playerId: player.id,
                choiceIndex: payload.choiceIndex,
                correctChoice: currentClue.clue.correctChoice,
                isCorrect
            });
        } else {
            // Fallback to text matching for legacy support
            const sanitizedAnswer = answerValidation.sanitized;
            const matchResult = AnswerNormalizer.checkMatch(sanitizedAnswer, currentClue.clue.answer);
            isCorrect = matchResult.isMatch;
            logger.info('Text answer validation', {
                component: 'GameManager',
                playerId: player.id,
                answer: sanitizedAnswer,
                correctAnswer: currentClue.clue.answer,
                isCorrect
            });
        }
        
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
        this.broadcastEvent(BuzzchainEvent.JUDGE, {
            playerId: player.id,
            playerName: player.username,
            answer: payload.answer,
            correct: isCorrect,
            correctAnswer: currentClue.clue.answer,
            scoreChange: scoreChange?.delta || 0,
            newScore: scoreChange?.newScore || 0
        });
        
        if (isCorrect) {
            // Clear answer timer for correct answers
            if (this.answerTimer) {
                clearTimeout(this.answerTimer);
                this.answerTimer = null;
            }

            // Correct answer - picker gets control
            this.currentPickerId = player.id;
            this.roundManager?.clearCurrentClue();
            this.buzzManager.closeBuzzWindow();

            await this.checkRoundComplete();
        } else {
            // Wrong answer - lock player and continue
            this.buzzManager.lockPlayer(player.id);
            
            if (currentClue.isDailyDouble) {
                // Daily Double wrong answer - end clue
                this.currentPickerId = this.assignNextPicker() || this.currentPickerId;
                this.roundManager?.clearCurrentClue();
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
            this.broadcastEvent(BuzzchainEvent.FINAL_ROUND, {
                phase: 'answer',
                category: this.finalRoundState.category,
                clue: this.finalRoundState.clue,
                timeLimit: 45000
            });

            // Start answer timer
            this.wagerTimer = setTimeout(() => {
                this.finalizeFinalRound();
            }, 45000);
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
        const packResult = await PackLoader.loadPackByName(this.gameConfig.packName);
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
        this.broadcastEvent(BuzzchainEvent.FINAL_ROUND, {
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
        this.broadcastEvent(BuzzchainEvent.FINAL_REVEAL, { results });
        
        // End game
        await this.endGame();
    }

    /**
     * End the current game
     */
    private async endGame(): Promise<void> {
        this.gamePhase = GamePhase.RESULTS;

        // Release all players from their podiums
        this.podiumManager.releaseAllPlayers(this.players);

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
        this.broadcastEvent(BuzzchainEvent.GAME_COMPLETE, {
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
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }
        if (this.wagerTimer) {
            clearTimeout(this.wagerTimer);
            this.wagerTimer = null;
        }
        if (this.autoHostTimeout) {
            clearTimeout(this.autoHostTimeout);
            this.autoHostTimeout = null;
        }

        // Stop AI update loop
        this.stopAIUpdateLoop();

        // Reset AI player final round tracking
        this.aiPlayers.forEach(aiPlayer => {
            (aiPlayer as any).finalWagerSubmitted = false;
            (aiPlayer as any).finalAnswerSubmitted = false;
        });

        // Clean up AI players
        for (const aiPlayer of this.aiPlayers.values()) {
            try {
                aiPlayer.destroy();
            } catch (error) {
                logger.error('Error destroying AI player', error as Error, {
                    component: 'GameManager',
                    aiPlayerId: aiPlayer.id
                });
            }
        }
        this.aiPlayers.clear();
        
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
        const humanPlayerIds = Array.from(this.players.keys());
        const aiPlayerIds = Array.from(this.aiPlayers.keys());

        logger.info('Assigning random picker', {
            component: 'GameManager',
            humanPlayerIds,
            aiPlayerIds,
            singlePlayerMode: this.gameConfig.singlePlayerMode
        });

        // In single player mode, always start with the human player
        if (this.gameConfig.singlePlayerMode && humanPlayerIds.length > 0) {
            this.currentPickerId = humanPlayerIds[0];
            logger.info('Assigned human player as initial picker in single player mode', {
                component: 'GameManager',
                pickerId: this.currentPickerId
            });
        } else {
            // Otherwise, choose randomly from all players
            const allPlayerIds = [...humanPlayerIds, ...aiPlayerIds];
            if (allPlayerIds.length > 0) {
                const randomIndex = Math.floor(Math.random() * allPlayerIds.length);
                this.currentPickerId = allPlayerIds[randomIndex];
                logger.info('Assigned random picker', {
                    component: 'GameManager',
                    pickerId: this.currentPickerId,
                    allPlayerIds,
                    randomIndex
                });
            } else {
                logger.error('No players available to assign as picker', {
                    component: 'GameManager',
                    humanPlayerIds,
                    aiPlayerIds
                });
            }
        }
    }

    private assignNextPicker(): string | null {
        const allPlayerIds = [
            ...Array.from(this.players.keys()),
            ...Array.from(this.aiPlayers.keys())
        ];
        if (allPlayerIds.length === 0) return null;

        const currentIndex = allPlayerIds.indexOf(this.currentPickerId || '');
        const nextIndex = (currentIndex + 1) % allPlayerIds.length;
        this.currentPickerId = allPlayerIds[nextIndex];
        return this.currentPickerId;
    }

    private checkAutoStart(): void {
        const totalPlayers = this.players.size + this.aiPlayers.size;

        if (this.gameConfig.autoStart &&
            this.gamePhase === GamePhase.LOBBY &&
            totalPlayers >= MIN_PLAYERS &&
            !this.autoHostTimeout) {

            // In single player mode, start immediately with AI players
            if (this.gameConfig.singlePlayerMode) {
                this.startGame();
                return;
            }

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
            this.broadcastEvent(BuzzchainEvent.JUDGE, {
                playerId: '',
                playerName: '',
                answer: '',
                correct: false,
                correctAnswer: currentClue.clue.answer,
                scoreChange: 0,
                newScore: 0
            });

            this.roundManager?.clearCurrentClue();

            // IMPORTANT: Assign next picker when no one answers
            this.assignNextPicker();

            this.checkRoundComplete();
        }
    }

    private startAnswerTimer(playerId: string | null): void {
        // Clear any existing answer timer
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }

        if (playerId) {
            // Give humans adequate time to type their answer (45 seconds instead of 20)
            this.answerTimer = setTimeout(() => {
                logger.info(`Answer timeout for player ${playerId}`, {
                    component: 'GameManager',
                    playerId,
                    timeoutDuration: '45 seconds'
                });
                this.handleAnswerTimeout(playerId);
            }, 45000); // Increased from 20 to 45 seconds

            logger.debug(`Answer timer started for player ${playerId}`, {
                component: 'GameManager',
                playerId,
                duration: '45 seconds'
            });
        }
    }

    private handleAnswerTimeout(playerId: string): void {
        // Clear the answer timer
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }

        logger.info(`Answer timeout handled for player ${playerId}`, {
            component: 'GameManager',
            playerId
        });

        // Continue with normal clue timeout handling
        this.handleClueTimeout();
    }

    private async broadcastGameState(): Promise<void> {
        // Get only human player scores (filter out AI players to avoid duplicates)
        const humanPlayers = this.scoreManager.getCurrentScores().filter(p => !p.id.startsWith('ai_'));

        // Add AI players to the player list
        const aiPlayerData: PlayerData[] = Array.from(this.aiPlayers.values()).map(ai => ({
            id: ai.id,
            name: ai.username,
            score: ai.score,
            stats: {
                correctAnswers: 0, // Would track these in AI player
                incorrectAnswers: 0,
                buzzWins: 0,
                averageBuzzTime: ai.personality.buzzDelay,
                currentStreak: 0
            }
        }));

        const allPlayers = [...humanPlayers, ...aiPlayerData];

        const gameState: GameStateData = {
            phase: this.gamePhase,
            board: this.roundManager?.getCurrentBoard() || null,
            usedCells: this.roundManager?.getUsedCells() || [],
            players: allPlayers,
            currentPickerId: this.currentPickerId,
            currentClue: this.roundManager?.getCurrentClue() || null,
            lockoutUntil: 0, // Would be calculated from buzz manager
            buzzWindowEnd: 0, // Would be calculated from buzz manager
            message: this.getStatusMessage(),
            round: this.roundManager?.getCurrentRound() || 1,
            timeRemaining: 0
        };

        this.broadcastEvent(BuzzchainEvent.GAME_STATE, { gameState });
    }

    private getStatusMessage(): string {
        switch (this.gamePhase) {
            case GamePhase.LOBBY:
                return `Waiting for players... (${this.players.size}/${MIN_PLAYERS} minimum)`;
            case GamePhase.INTRO:
                return 'Welcome to BUZZCHAIN! Introducing contestants...';
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

    private broadcastEvent(type: BuzzchainEvent, payload: any): void {
        const eventData = createServerEvent(type, payload);
        
        for (const player of this.players.values()) {
            player.ui.sendData(eventData);
        }
    }

    private broadcastMessage(message: string, color: string = '#FFFFFF'): void {
        const validColor = this.validateColor(color);
        for (const player of this.players.values()) {
            try {
                this.world.chatManager.sendPlayerMessage(player, message, validColor);
            } catch (error) {
                logger.error('Failed to broadcast message to player', error as Error, {
                    component: 'GameManager',
                    playerId: player.id,
                    messageLength: message.length
                });
                // Fallback without color
                this.world.chatManager.sendPlayerMessage(player, message);
            }
        }
    }

    private sendPlayerMessage(player: Player, message: string, color: string = '#FFFFFF'): void {
        try {
            // Ensure color is valid hex format
            const validColor = this.validateColor(color);
            this.world.chatManager.sendPlayerMessage(player, message, validColor);
        } catch (error) {
            logger.error('Failed to send player message', error as Error, {
                component: 'GameManager',
                playerId: player.id,
                messageLength: message.length
            });
            // Fallback without color
            this.world.chatManager.sendPlayerMessage(player, message);
        }
    }

    private validateColor(color: string): string {
        // Remove # if present and ensure color is valid hex format
        const cleanColor = color.replace('#', '');
        
        if (!/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
            logger.warn(`Invalid color format: ${color}, using default`, {
                component: 'GameManager'
            });
            return 'FFFFFF'; // Return without #
        }
        return cleanColor.toUpperCase();
    }
}

export default GameManager;