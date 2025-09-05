// AIPlayer - Artificial Intelligence player for single player mode
// Simulates human player behavior with configurable difficulty and personality

import { Player, World, DefaultPlayerEntity } from 'hytopia';
import { GameStateData, ClueData } from '../net/Events';
import { logger } from '../util/Logger';

export enum AIDifficulty {
    EASY = 'EASY',       // Slower reactions, more mistakes, basic strategy
    MEDIUM = 'MEDIUM',   // Average human reaction time, occasional mistakes
    HARD = 'HARD',       // Fast reactions, fewer mistakes, strategic play
    EXPERT = 'EXPERT'    // Very fast, minimal mistakes, optimal strategy
}

export interface AIPersonality {
    name: string;
    avatar: string; // NPC model identifier
    difficulty: AIDifficulty;
    buzzDelay: number; // ms delay before buzzing
    buzzAccuracy: number; // 0-1, chance of buzzing when they know answer
    answerAccuracy: number; // 0-1, chance of getting answer right
    wagerStrategy: 'conservative' | 'aggressive' | 'optimal';
    cluePreference: 'random' | 'highValue' | 'lowValue' | 'categories';
}

export interface AIGameActions {
    selectCell: (categoryIndex: number, clueIndex: number, playerId: string) => void;
    buzz: (playerId: string) => void;
    submitAnswer: (answer: string, playerId: string) => void;
    submitWager: (wager: number, playerId: string) => void;
}

export class AIPlayer {
    public id: string;
    public username: string;
    public personality: AIPersonality;
    public score: number = 0;
    public entity: DefaultPlayerEntity | null = null;

    // AI state
    private knowledge: Map<string, boolean> = new Map(); // clue -> knows answer
    private buzzTimers: Map<string, NodeJS.Timeout> = new Map();
    private isActive: boolean = true;
    private lastActionTime: number = 0;
    private gameActions: AIGameActions | null = null;

    constructor(world: World, personality: AIPersonality, gameActions?: AIGameActions) {
        this.id = `ai_${personality.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        this.username = personality.name;
        this.personality = personality;
        this.gameActions = gameActions || null;

        // Spawn NPC entity
        this.spawnNPC(world);

        logger.info(`AI Player ${this.username} created`, {
            component: 'AIPlayer',
            difficulty: personality.difficulty,
            playerId: this.id,
            hasActions: !!gameActions
        });
    }

    private spawnNPC(world: World): void {
        try {
            // Create a mock player object with necessary properties for AI
            const mockPlayer = {
                id: this.id,
                username: this.username,
                camera: {
                    orientation: { pitch: 0, yaw: 0 },
                    facingDirection: { x: 0, y: 0, z: -1 },
                    setMode: () => {},
                    setOffset: () => {},
                    setForwardOffset: () => {},
                    setFilmOffset: () => {},
                    setHiddenModelNodes: () => {}
                },
                world: world,
                input: {
                    // Mock player input for AI
                    movement: { x: 0, y: 0, z: 0 },
                    actions: new Set()
                }
            } as any;

            this.entity = new DefaultPlayerEntity({
                player: mockPlayer,
                name: this.username,
            });

            // Generate random spawn position near human players
            const spawnPosition = this.getAISpawnPosition(world);
            this.entity.spawn(world, spawnPosition);

            logger.info(`AI Player ${this.username} spawned NPC`, {
                component: 'AIPlayer',
                playerId: this.id,
                position: spawnPosition
            });
        } catch (error) {
            logger.error(`Failed to spawn AI player ${this.username}`, error as Error, {
                component: 'AIPlayer',
                playerId: this.id
            });
        }
    }

    private getAISpawnPosition(world: World): { x: number; y: number; z: number } {
        // Spawn AI players in a circle around the center
        const radius = 8;
        const angle = Math.random() * Math.PI * 2;
        return {
            x: Math.cos(angle) * radius,
            y: 10,
            z: Math.sin(angle) * radius
        };
    }

    // AI decision making - called by GameManager
    public updateGameState(gameState: GameStateData): void {
        // AI analyzes game state to make decisions
        this.makeAIDecision(gameState);
    }

    private makeAIDecision(gameState: GameStateData): void {
        const now = Date.now();
        if (now - this.lastActionTime < 1000) return; // Rate limit AI actions

        switch (gameState.phase) {
            case 'ROUND1':
            case 'ROUND2':
                this.handleRoundDecision(gameState);
                break;
            case 'FINAL':
                this.handleFinalRoundDecision(gameState);
                break;
        }
        this.lastActionTime = now;
    }

    private handleRoundDecision(gameState: GameStateData): void {
        // AI selects clues or buzzes based on personality
        if (gameState.currentClue && !gameState.currentPickerId) {
            this.handleBuzzDecision(gameState);
        } else if (!gameState.currentClue) {
            this.handleClueSelection(gameState);
        }
    }

    private handleBuzzDecision(gameState: GameStateData): void {
        const clue = gameState.currentClue;
        if (!clue) return;

        // Determine if AI knows the answer
        const knowsAnswer = this.determineKnowledge(clue.clue.answer);

        if (knowsAnswer && Math.random() < this.personality.buzzAccuracy) {
            // Schedule buzz with personality-based delay
            const buzzDelay = this.personality.buzzDelay + (Math.random() * 500);
            setTimeout(() => {
                this.simulateBuzz();
            }, buzzDelay);
        }
    }

    private handleClueSelection(gameState: GameStateData): void {
        // AI selects clue based on strategy
        if (this.personality.cluePreference === 'highValue') {
            this.selectHighValueClue(gameState);
        } else if (this.personality.cluePreference === 'lowValue') {
            this.selectLowValueClue(gameState);
        } else {
            this.selectRandomClue(gameState);
        }
    }

    private selectHighValueClue(gameState: GameStateData): void {
        // Find highest value available clue
        let bestCategory = 0;
        let bestIndex = 0;
        let highestValue = 0;

        // This would need board data - simplified for now
        this.simulateClueSelection(bestCategory, bestIndex);
    }

    private selectLowValueClue(gameState: GameStateData): void {
        // Find lowest value available clue
        let bestCategory = 0;
        let bestIndex = 4; // Start with highest index (lowest value)
        this.simulateClueSelection(bestCategory, bestIndex);
    }

    private selectRandomClue(gameState: GameStateData): void {
        const category = Math.floor(Math.random() * 6);
        const index = Math.floor(Math.random() * 5);
        this.simulateClueSelection(category, index);
    }

    private simulateClueSelection(categoryIndex: number, clueIndex: number): void {
        logger.info(`AI ${this.username} selecting clue`, {
            component: 'AIPlayer',
            categoryIndex,
            clueIndex,
            playerId: this.id
        });

        // Execute the action if game actions are available
        if (this.gameActions) {
            try {
                this.gameActions.selectCell(categoryIndex, clueIndex, this.id);
            } catch (error) {
                logger.error('AI failed to select cell', error as Error, {
                    component: 'AIPlayer',
                    playerId: this.id,
                    categoryIndex,
                    clueIndex
                });
            }
        }
    }

    private simulateBuzz(): void {
        logger.info(`AI ${this.username} buzzing`, {
            component: 'AIPlayer',
            playerId: this.id
        });

        // Execute the action if game actions are available
        if (this.gameActions) {
            try {
                this.gameActions.buzz(this.id);
            } catch (error) {
                logger.error('AI failed to buzz', error as Error, {
                    component: 'AIPlayer',
                    playerId: this.id
                });
            }
        }
    }

    private handleFinalRoundDecision(gameState: GameStateData): void {
        // AI makes final round wager and answer decisions
        const wager = this.calculateWager(this.score);
        const answer = this.generateFinalAnswer();

        logger.info(`AI ${this.username} final round decision`, {
            component: 'AIPlayer',
            wager,
            playerId: this.id
        });
    }

    private calculateWager(currentScore: number): number {
        const baseWager = Math.max(1000, currentScore * 0.1);

        switch (this.personality.wagerStrategy) {
            case 'conservative':
                return Math.floor(baseWager * 0.5);
            case 'aggressive':
                return Math.floor(baseWager * 2.0);
            case 'optimal':
            default:
                return Math.floor(baseWager);
        }
    }

    private generateFinalAnswer(): string {
        // Generate a plausible answer format
        return "What is [AI Generated Answer]?";
    }

    private determineKnowledge(correctAnswer: string): boolean {
        // Simple knowledge determination based on difficulty
        const baseChance = {
            [AIDifficulty.EASY]: 0.4,
            [AIDifficulty.MEDIUM]: 0.6,
            [AIDifficulty.HARD]: 0.8,
            [AIDifficulty.EXPERT]: 0.95
        }[this.personality.difficulty];

        return Math.random() < baseChance;
    }

    public simulateAnswer(clue: ClueData): { answer: string; isCorrect: boolean } {
        const knowsAnswer = this.determineKnowledge(clue.answer);

        if (knowsAnswer && Math.random() < this.personality.answerAccuracy) {
            return {
                answer: `What is ${clue.answer}?`,
                isCorrect: true
            };
        } else {
            // Generate wrong answer
            return {
                answer: `What is ${this.generateWrongAnswer(clue.answer)}?`,
                isCorrect: false
            };
        }
    }

    private generateWrongAnswer(correctAnswer: string): string {
        // Simple wrong answer generation
        const wrongAnswers = [
            "Something completely different",
            "A related but wrong answer",
            "An obvious mistake"
        ];
        return wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
    }

    public destroy(): void {
        this.isActive = false;

        // Clear any pending timers
        for (const timer of this.buzzTimers.values()) {
            clearTimeout(timer);
        }
        this.buzzTimers.clear();

        // Destroy NPC entity
        if (this.entity) {
            // Remove entity from world if destroy method doesn't exist
            // this.entity.destroy(); // Method may not exist in HYTOPIA SDK
            this.entity = null;
        }

        logger.info(`AI Player ${this.username} destroyed`, {
            component: 'AIPlayer',
            playerId: this.id
        });
    }
}

// Predefined AI personalities with different play styles
export const AI_PERSONALITIES: AIPersonality[] = [
    {
        name: "Alex the Scholar",
        avatar: "scholar",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 800,
        buzzAccuracy: 0.9,
        answerAccuracy: 0.85,
        wagerStrategy: 'optimal',
        cluePreference: 'highValue'
    },
    {
        name: "Jordan the Speedster",
        avatar: "athlete",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 300,
        buzzAccuracy: 0.95,
        answerAccuracy: 0.75,
        wagerStrategy: 'aggressive',
        cluePreference: 'random'
    },
    {
        name: "Taylor the Thinker",
        avatar: "thinker",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 1200,
        buzzAccuracy: 0.8,
        answerAccuracy: 0.95,
        wagerStrategy: 'conservative',
        cluePreference: 'categories'
    },
    {
        name: "Casey the Newbie",
        avatar: "student",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 2000,
        buzzAccuracy: 0.6,
        answerAccuracy: 0.6,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Morgan the Strategist",
        avatar: "strategist",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 1000,
        buzzAccuracy: 0.85,
        answerAccuracy: 0.9,
        wagerStrategy: 'optimal',
        cluePreference: 'highValue'
    }
];

export default AIPlayer;
