// AIPlayer - Artificial Intelligence player for single player mode
// Simulates human player behavior with configurable difficulty and personality

import { Player, World, Entity, RigidBodyType } from 'hytopia';
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
    submitAnswer: (answer: string, playerId: string, choiceIndex?: number) => void;
    submitWager: (wager: number, playerId: string) => void;
}

export class AIPlayer {
    public id: string;
    public username: string;
    public personality: AIPersonality;
    public score: number = 0;
    public entity: Entity | null = null;

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
            // Create a proper NPC entity using the HYTOPIA SDK
            this.entity = new Entity({
                name: this.username,
                modelUri: `models/npcs/${this.personality.avatar}.gltf`,
                modelScale: 1.0,
                modelLoopedAnimations: ['idle'], // Play idle animation if available
                rigidBodyOptions: {
                    type: RigidBodyType.KINEMATIC_POSITION, // Allows programmatic movement control
                }
            });

            // Generate random spawn position near human players
            const spawnPosition = this.getAISpawnPosition(world);
            this.entity.spawn(world, spawnPosition);

            logger.info(`AI Player ${this.username} spawned NPC`, {
                component: 'AIPlayer',
                playerId: this.id,
                position: spawnPosition,
                model: this.personality.avatar,
                modelPath: `models/npcs/${this.personality.avatar}.gltf`
            });
        } catch (error) {
            logger.error(`Failed to spawn AI player ${this.username}`, error as Error, {
                component: 'AIPlayer',
                playerId: this.id,
                model: this.personality.avatar
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

    /**
     * Make the AI NPC look at a specific position
     */
    public lookAt(targetPosition: { x: number; y: number; z: number }): void {
        if (!this.entity || !this.entity.isSpawned) return;
        
        try {
            const currentPos = this.entity.position;
            const direction = {
                x: targetPosition.x - currentPos.x,
                z: targetPosition.z - currentPos.z
            };
            
            const yaw = Math.atan2(direction.x, direction.z);
            // Use quaternion rotation for HYTOPIA SDK
            const quaternion = {
                x: 0,
                y: Math.sin(yaw / 2),
                z: 0,
                w: Math.cos(yaw / 2)
            };
            this.entity.setRotation(quaternion);
        } catch (error) {
            logger.warn(`Failed to make AI ${this.username} look at target`, {
                component: 'AIPlayer',
                playerId: this.id,
                error: error
            });
        }
    }

    /**
     * Get the current position of the AI NPC
     */
    public getPosition(): { x: number; y: number; z: number } | null {
        if (!this.entity || !this.entity.isSpawned) return null;
        return this.entity.position;
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
        } else if (gameState.currentClue && gameState.currentPickerId === this.id) {
            // Handle Daily Double wager if this AI is the picker
            this.handleDailyDoubleWager(gameState);
            // Also handle answering after the wager is submitted
            this.handleDailyDoubleAnswer(gameState);
        }
    }

    private handleBuzzDecision(gameState: GameStateData): void {
        const clue = gameState.currentClue;
        if (!clue) return;

        // Don't buzz immediately - give human players time (15 seconds minimum)
        setTimeout(() => {
            this.considerBuzzing(gameState);
        }, 15000);
    }

    private considerBuzzing(gameState: GameStateData): void {
        const clue = gameState.currentClue;
        if (!clue) return;

        // Determine if AI knows the answer
        const knowsAnswer = this.determineKnowledge(clue.clue.answer);

        if (knowsAnswer && Math.random() < this.personality.buzzAccuracy) {
            // Schedule buzz with personality-based delay
            // Add 10 second minimum delay to give human players advantage
            const MIN_AI_BUZZ_DELAY = 10000; // 10 seconds minimum for AI
            const buzzDelay = MIN_AI_BUZZ_DELAY + this.personality.buzzDelay + (Math.random() * 2000);

            logger.info(`AI ${this.username} will buzz in ${buzzDelay}ms`, {
                component: 'AIPlayer',
                playerId: this.id,
                baseDelay: MIN_AI_BUZZ_DELAY,
                personalityDelay: this.personality.buzzDelay
            });

            setTimeout(() => {
                this.simulateBuzz();
                // After buzzing, schedule answer submission with choice information
                this.scheduleAnswerSubmission(
                    clue.clue.answer,
                    knowsAnswer,
                    clue.clue.choices,
                    clue.clue.correctChoice
                );
            }, buzzDelay);
        }
    }

    private handleClueSelection(gameState: GameStateData): void {
        // Only select clue if this AI is the current picker
        if (gameState.currentPickerId !== this.id) {
            return;
        }

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
        for (let index = 4; index >= 0; index--) { // Start from highest value
            for (let category = 0; category < 6; category++) {
                const cellKey = `${category}-${index}`;
                if (gameState.usedCells && !gameState.usedCells.includes(cellKey)) {
                    this.simulateClueSelection(category, index);
                    return;
                }
            }
        }
        // Fallback to random if no high value found
        this.selectRandomClue(gameState);
    }

    private selectLowValueClue(gameState: GameStateData): void {
        // Find lowest value available clue
        for (let index = 0; index < 5; index++) { // Start from lowest value
            for (let category = 0; category < 6; category++) {
                const cellKey = `${category}-${index}`;
                if (gameState.usedCells && !gameState.usedCells.includes(cellKey)) {
                    this.simulateClueSelection(category, index);
                    return;
                }
            }
        }
        // Fallback to random if no low value found
        this.selectRandomClue(gameState);
    }

    private selectRandomClue(gameState: GameStateData): void {
        // Try to find an available cell
        const maxAttempts = 30;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const category = Math.floor(Math.random() * 6);
            const index = Math.floor(Math.random() * 5);
            const cellKey = `${category}-${index}`;

            // Check if cell is not used
            if (!gameState.usedCells || !gameState.usedCells.includes(cellKey)) {
                this.simulateClueSelection(category, index);
                return;
            }
            attempts++;
        }

        // If no random cell found, try to find any available cell systematically
        for (let cat = 0; cat < 6; cat++) {
            for (let idx = 0; idx < 5; idx++) {
                const cellKey = `${cat}-${idx}`;
                if (!gameState.usedCells || !gameState.usedCells.includes(cellKey)) {
                    this.simulateClueSelection(cat, idx);
                    return;
                }
            }
        }

        logger.warn(`AI ${this.username} could not find any available cells`, {
            component: 'AIPlayer',
            playerId: this.id,
            usedCells: gameState.usedCells
        });
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

    private scheduleAnswerSubmission(correctAnswer: string, knowsAnswer: boolean, choices?: string[], correctChoice?: number): void {
        // Give AI much more time to "think" after buzzing - let humans have a real chance
        const thinkingTime = 8000 + (Math.random() * 5000); // 8-13 seconds

        setTimeout(() => {
            const willAnswerCorrectly = knowsAnswer && Math.random() < this.personality.answerAccuracy;

            let answer: string;
            let choiceIndex: number | undefined;

            if (choices && correctChoice !== undefined) {
                // Multiple choice logic
                if (willAnswerCorrectly) {
                    choiceIndex = correctChoice;
                    answer = choices[correctChoice];
                } else {
                    // Pick a random wrong choice
                    const wrongChoices = choices.map((_, index) => index).filter(index => index !== correctChoice);
                    choiceIndex = wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
                    answer = choices[choiceIndex];
                }
            } else {
                // Fallback to text answers
                if (willAnswerCorrectly) {
                    answer = correctAnswer; // Give correct answer
                } else {
                    answer = this.generateIncorrectAnswer(); // Generate plausible wrong answer
                }
            }

            logger.info(`AI ${this.username} submitting answer`, {
                component: 'AIPlayer',
                playerId: this.id,
                knowsAnswer: knowsAnswer,
                willAnswerCorrectly: willAnswerCorrectly,
                choiceIndex: choiceIndex,
                answer: answer
            });

            if (this.gameActions) {
                try {
                    this.gameActions.submitAnswer(answer, this.id, choiceIndex);
                } catch (error) {
                    logger.error('AI failed to submit answer', error as Error, {
                        component: 'AIPlayer',
                        playerId: this.id,
                        answer: answer,
                        choiceIndex: choiceIndex
                    });
                }
            }
        }, thinkingTime);
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

    private handleDailyDoubleWager(gameState: GameStateData): void {
        const currentClue = gameState.currentClue;
        if (!currentClue || !currentClue.isDailyDouble || currentClue.wager !== undefined) {
            return; // Not a Daily Double or wager already submitted
        }

        // Calculate appropriate wager for Daily Double
        const maxWager = currentClue.maxWager || 1000;
        const wager = this.calculateDailyDoubleWager(this.score, maxWager, currentClue.clue.value);

        logger.info(`AI ${this.username} making Daily Double wager`, {
            component: 'AIPlayer',
            playerId: this.id,
            wager: wager,
            maxWager: maxWager,
            currentScore: this.score
        });

        // Submit the wager
        if (this.gameActions) {
            try {
                this.gameActions.submitWager(wager, this.id);
            } catch (error) {
                logger.error('AI failed to submit Daily Double wager', error as Error, {
                    component: 'AIPlayer',
                    playerId: this.id,
                    wager: wager
                });
            }
        }
    }

    private handleDailyDoubleAnswer(gameState: GameStateData): void {
        const currentClue = gameState.currentClue;
        if (!currentClue || !currentClue.isDailyDouble || currentClue.wager === undefined) {
            return; // Not ready to answer Daily Double yet
        }

        // Determine if AI knows the answer and generate response
        const knowsAnswer = this.determineKnowledge(currentClue.clue.answer);
        const willAnswerCorrectly = knowsAnswer && Math.random() < this.personality.answerAccuracy;

        let answer: string;
        if (willAnswerCorrectly) {
            answer = currentClue.clue.answer; // Give correct answer
        } else {
            answer = this.generateIncorrectAnswer(); // Generate plausible wrong answer
        }

        logger.info(`AI ${this.username} answering Daily Double`, {
            component: 'AIPlayer',
            playerId: this.id,
            knowsAnswer: knowsAnswer,
            willAnswerCorrectly: willAnswerCorrectly,
            wager: currentClue.wager
        });

        // Add realistic delay before answering
        const answerDelay = this.personality.buzzDelay + (Math.random() * 1000);
        setTimeout(() => {
            if (this.gameActions) {
                try {
                    this.gameActions.submitAnswer(answer, this.id);
                } catch (error) {
                    logger.error('AI failed to submit Daily Double answer', error as Error, {
                        component: 'AIPlayer',
                        playerId: this.id,
                        answer: answer
                    });
                }
            }
        }, answerDelay);
    }

    private calculateDailyDoubleWager(currentScore: number, maxWager: number, clueValue: number): number {
        // Base the wager on AI personality and current score
        let wager: number;

        switch (this.personality.wagerStrategy) {
            case 'conservative':
                // Conservative: Wager the clue value or a small portion of score
                wager = Math.min(clueValue, Math.max(clueValue, currentScore * 0.1));
                break;
            case 'aggressive':
                // Aggressive: Go big, wager close to maximum
                wager = Math.floor(maxWager * 0.8);
                break;
            case 'optimal':
            default:
                // Optimal: Balance risk vs reward
                if (currentScore > 0) {
                    wager = Math.min(maxWager, Math.max(clueValue * 2, currentScore * 0.3));
                } else {
                    wager = Math.min(maxWager, clueValue * 2);
                }
                break;
        }

        // Ensure wager is within valid range
        wager = Math.max(clueValue, Math.min(maxWager, wager));
        return Math.floor(wager);
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

    private generateIncorrectAnswer(): string {
        // Generate plausible wrong answers in proper trivia format
        const wrongAnswers = [
            "What is the wrong answer?",
            "Who is someone else?",
            "What is something different?",
            "Where is another place?",
            "When is a different time?",
            "What is not correct?",
            "Who is incorrect?",
            "What is false?",
            "What is mistaken?",
            "Who is wrong?"
        ];

        return wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
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
        this.buzzTimers.forEach((timer) => {
            clearTimeout(timer);
        });
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

// Predefined AI personalities with different play styles using actual HYTOPIA NPC models
// Buzzy Bee is now the host, so he's not included as a player
export const AI_PERSONALITIES: AIPersonality[] = [
    // EXPERT DIFFICULTY (Top Tier Players)
    {
        name: "Professor Mindflayer",
        avatar: "mindflayer",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 500,
        buzzAccuracy: 0.95,
        answerAccuracy: 0.95,
        wagerStrategy: 'optimal',
        cluePreference: 'highValue'
    },
    {
        name: "Wise Ocelot",
        avatar: "ocelot",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 700,
        buzzAccuracy: 0.9,
        answerAccuracy: 0.93,
        wagerStrategy: 'optimal',
        cluePreference: 'categories'
    },
    {
        name: "Prima Donna",
        avatar: "ballerinacapuchina",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 600,
        buzzAccuracy: 0.92,
        answerAccuracy: 0.94,
        wagerStrategy: 'aggressive',
        cluePreference: 'highValue'
    },
    {
        name: "Croc Champion",
        avatar: "bombardinococodrilo",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 800,
        buzzAccuracy: 0.88,
        answerAccuracy: 0.92,
        wagerStrategy: 'aggressive',
        cluePreference: 'random'
    },
    {
        name: "Bombastic Bob",
        avatar: "payload-bomb",
        difficulty: AIDifficulty.EXPERT,
        buzzDelay: 400,
        buzzAccuracy: 0.93,
        answerAccuracy: 0.9,
        wagerStrategy: 'aggressive',
        cluePreference: 'highValue'
    },

    // HARD DIFFICULTY (Skilled Players)
    {
        name: "Captain Spider",
        avatar: "spider",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 1000,
        buzzAccuracy: 0.85,
        answerAccuracy: 0.88,
        wagerStrategy: 'optimal',
        cluePreference: 'highValue'
    },
    {
        name: "Zombie Scholar",
        avatar: "zombie",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 1200,
        buzzAccuracy: 0.8,
        answerAccuracy: 0.85,
        wagerStrategy: 'conservative',
        cluePreference: 'categories'
    },
    {
        name: "Skeletal Sage",
        avatar: "skeleton",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 900,
        buzzAccuracy: 0.83,
        answerAccuracy: 0.87,
        wagerStrategy: 'optimal',
        cluePreference: 'random'
    },
    {
        name: "Shadow Stalker",
        avatar: "stalker",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 700,
        buzzAccuracy: 0.87,
        answerAccuracy: 0.84,
        wagerStrategy: 'aggressive',
        cluePreference: 'highValue'
    },
    {
        name: "Tentacle Tactician",
        avatar: "squid",
        difficulty: AIDifficulty.HARD,
        buzzDelay: 1100,
        buzzAccuracy: 0.82,
        answerAccuracy: 0.86,
        wagerStrategy: 'conservative',
        cluePreference: 'categories'
    },

    // MEDIUM DIFFICULTY (Average Players)
    {
        name: "Moo-nificent Mike",
        avatar: "cow",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1500,
        buzzAccuracy: 0.75,
        answerAccuracy: 0.75,
        wagerStrategy: 'conservative',
        cluePreference: 'random'
    },
    {
        name: "Galloping Genius",
        avatar: "horse",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1000,
        buzzAccuracy: 0.78,
        answerAccuracy: 0.77,
        wagerStrategy: 'optimal',
        cluePreference: 'categories'
    },
    {
        name: "Determined Donkey",
        avatar: "donkey",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1800,
        buzzAccuracy: 0.7,
        answerAccuracy: 0.78,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Batty Brainiac",
        avatar: "bat",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 800,
        buzzAccuracy: 0.8,
        answerAccuracy: 0.73,
        wagerStrategy: 'aggressive',
        cluePreference: 'random'
    },
    {
        name: "Carnival King",
        avatar: "bonecaambalabu",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1300,
        buzzAccuracy: 0.72,
        answerAccuracy: 0.76,
        wagerStrategy: 'aggressive',
        cluePreference: 'highValue'
    },
    {
        name: "Melody Master",
        avatar: "tralalerotralala",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1400,
        buzzAccuracy: 0.73,
        answerAccuracy: 0.74,
        wagerStrategy: 'optimal',
        cluePreference: 'categories'
    },
    {
        name: "Rhythm Rival",
        avatar: "tungtungtungsahur",
        difficulty: AIDifficulty.MEDIUM,
        buzzDelay: 1200,
        buzzAccuracy: 0.76,
        answerAccuracy: 0.72,
        wagerStrategy: 'aggressive',
        cluePreference: 'random'
    },

    // EASY DIFFICULTY (Beginner Players)
    {
        name: "Rookie Rabbit",
        avatar: "rabbit",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 2000,
        buzzAccuracy: 0.6,
        answerAccuracy: 0.6,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Clucky Champion",
        avatar: "chicken",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 2200,
        buzzAccuracy: 0.55,
        answerAccuracy: 0.58,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Peppa Player",
        avatar: "pig",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 2500,
        buzzAccuracy: 0.5,
        answerAccuracy: 0.62,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Woolly Wizard",
        avatar: "sheep",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 2300,
        buzzAccuracy: 0.58,
        answerAccuracy: 0.55,
        wagerStrategy: 'conservative',
        cluePreference: 'lowValue'
    },
    {
        name: "Baby Buzz",
        avatar: "bee-baby",
        difficulty: AIDifficulty.EASY,
        buzzDelay: 1800,
        buzzAccuracy: 0.65,
        answerAccuracy: 0.5,
        wagerStrategy: 'aggressive', // Baby bee tries to be like Buzzy!
        cluePreference: 'random'
    }
];

export default AIPlayer;
