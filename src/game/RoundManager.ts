// RoundManager - Manages game rounds, Daily Doubles, and Final Round for Clueboard
// Handles board state, clue selection, and round progression

import { GamePhase, ClueData, CategoryData, DailyDoubleData, BoardData, CurrentClueData } from '../net/Events';
import { logger } from '../util/Logger';

export interface RoundState {
    round: number;
    phase: GamePhase;
    board: BoardData;
    usedCells: Set<string>;
    remainingClues: number;
    dailyDoublesRevealed: Set<string>;
    currentClue: CurrentClueData | null;
}

export interface ClueSelectionResult {
    success: boolean;
    clue?: CurrentClueData;
    isDailyDouble?: boolean;
    error?: string;
}

export interface RoundCompleteInfo {
    round: number;
    totalClues: number;
    completedClues: number;
    hasNextRound: boolean;
    nextPhase: GamePhase;
}

export class RoundManager {
    private roundState: RoundState;
    private originalBoard: BoardData;

    constructor(board: BoardData) {
        this.originalBoard = { ...board, categories: board.categories.map(cat => ({ ...cat })) };
        this.roundState = this.initializeRound(1, board);
    }

    /**
     * Initialize a round with board data
     */
    private initializeRound(roundNumber: number, board: BoardData): RoundState {
        return {
            round: roundNumber,
            phase: roundNumber === 1 ? GamePhase.ROUND1 : GamePhase.ROUND2,
            board: { ...board, categories: board.categories.map(cat => ({ ...cat })) },
            usedCells: new Set(),
            remainingClues: this.calculateTotalClues(board),
            dailyDoublesRevealed: new Set(),
            currentClue: null
        };
    }

    /**
     * Select a clue cell and return the clue data
     */
    selectCell(categoryIndex: number, clueIndex: number, pickerId: string): ClueSelectionResult {
        try {
            // Validate cell position
            const validation = this.validateCellSelection(categoryIndex, clueIndex);
            if (!validation.valid) {
                logger.warn(`Invalid cell selection: ${validation.error}`, {
                    component: 'RoundManager',
                    categoryIndex,
                    clueIndex,
                    pickerId
                });
                return { success: false, error: validation.error };
            }

            // Check if cell is available
            if (!this.isCellAvailable(categoryIndex, clueIndex)) {
                logger.warn(`Cell already used: ${categoryIndex}-${clueIndex}`, {
                    component: 'RoundManager',
                    categoryIndex,
                    clueIndex,
                    pickerId
                });
                return { success: false, error: 'Cell already used' };
            }

            // Get and validate clue data
            const clueData = this.getClueData(categoryIndex, clueIndex);
            if (!clueData) {
                return { success: false, error: 'Clue not found' };
            }

            // Process the selection
            return this.processCellSelection(categoryIndex, clueIndex, clueData, pickerId);

        } catch (error) {
            logger.error('Error selecting cell', error as Error, {
                component: 'RoundManager',
                categoryIndex,
                clueIndex,
                pickerId
            });
            return { success: false, error: 'Internal error occurred' };
        }
    }

    /**
     * Check if current round is complete
     */
    isRoundComplete(): boolean {
        return this.roundState.remainingClues === 0;
    }

    /**
     * Get round completion information
     */
    getRoundCompleteInfo(): RoundCompleteInfo {
        const totalClues = this.calculateTotalClues(this.originalBoard);
        const completedClues = totalClues - this.roundState.remainingClues;
        
        return {
            round: this.roundState.round,
            totalClues,
            completedClues,
            hasNextRound: this.roundState.round === 1,
            nextPhase: this.roundState.round === 1 ? GamePhase.ROUND2 : GamePhase.FINAL
        };
    }

    /**
     * Advance to next round
     */
    advanceToNextRound(): boolean {
        if (this.roundState.round === 1) {
            // Move to Round 2 with doubled values
            const round2Board = this.createRound2Board();
            this.roundState = this.initializeRound(2, round2Board);
            return true;
        }
        
        // No more regular rounds after Round 2
        return false;
    }

    /**
     * Start Final Round
     */
    startFinalRound(): void {
        this.roundState.phase = GamePhase.FINAL;
        this.roundState.currentClue = null;
        this.roundState.remainingClues = 1; // Final round has one question
    }

    /**
     * Get current round state
     */
    getRoundState(): RoundState {
        return {
            ...this.roundState,
            usedCells: new Set(this.roundState.usedCells),
            dailyDoublesRevealed: new Set(this.roundState.dailyDoublesRevealed)
        };
    }

    /**
     * Get current clue
     */
    getCurrentClue(): CurrentClueData | null {
        return this.roundState.currentClue;
    }

    /**
     * Clear current clue (after answering)
     */
    clearCurrentClue(): void {
        this.roundState.currentClue = null;
    }

    /**
     * Get board for current round
     */
    getCurrentBoard(): BoardData {
        return {
            categories: this.roundState.board.categories.map(cat => ({ ...cat })),
            dailyDoubles: [...this.roundState.board.dailyDoubles]
        };
    }

    /**
     * Get used cells as string array for network transmission
     */
    getUsedCells(): string[] {
        return Array.from(this.roundState.usedCells);
    }

    /**
     * Get remaining clues count
     */
    getRemainingClues(): number {
        return this.roundState.remainingClues;
    }

    /**
     * Check if a specific cell is a Daily Double
     */
    isDailyDouble(categoryIndex: number, clueIndex: number): boolean {
        return this.roundState.board.dailyDoubles.some(dd => 
            dd.category === categoryIndex && dd.index === clueIndex
        );
    }

    /**
     * Get all Daily Double positions for current round
     */
    getDailyDoublePositions(): DailyDoubleData[] {
        return [...this.roundState.board.dailyDoubles];
    }

    /**
     * Check if all Daily Doubles have been revealed
     */
    areAllDailyDoublesRevealed(): boolean {
        const totalDailyDoubles = this.roundState.board.dailyDoubles.length;
        return this.roundState.dailyDoublesRevealed.size >= totalDailyDoubles;
    }

    /**
     * Get category name by index
     */
    getCategoryName(categoryIndex: number): string {
        const category = this.roundState.board.categories[categoryIndex];
        return category ? category.name : 'Unknown Category';
    }

    /**
     * Get clue value by position
     */
    getClueValue(categoryIndex: number, clueIndex: number): number {
        const category = this.roundState.board.categories[categoryIndex];
        const clue = category?.clues[clueIndex];
        return clue ? clue.value : 0;
    }

    /**
     * Get random unused cell for automatic selection (if needed)
     */
    getRandomUnusedCell(): { category: number; index: number } | null {
        const unusedCells: Array<{ category: number; index: number }> = [];
        
        for (let categoryIndex = 0; categoryIndex < this.roundState.board.categories.length; categoryIndex++) {
            const category = this.roundState.board.categories[categoryIndex];
            for (let clueIndex = 0; clueIndex < category.clues.length; clueIndex++) {
                const cellKey = this.getCellKey(categoryIndex, clueIndex);
                if (!this.roundState.usedCells.has(cellKey)) {
                    unusedCells.push({ category: categoryIndex, index: clueIndex });
                }
            }
        }
        
        if (unusedCells.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * unusedCells.length);
        return unusedCells[randomIndex];
    }

    /**
     * Restore board state (for game state synchronization)
     */
    restoreState(usedCells: string[], currentClue: CurrentClueData | null): void {
        this.roundState.usedCells = new Set(usedCells);
        this.roundState.currentClue = currentClue;
        this.roundState.remainingClues = this.calculateRemainingClues();
        
        // Update revealed Daily Doubles
        this.roundState.dailyDoublesRevealed.clear();
        for (const cellKey of usedCells) {
            const [categoryStr, indexStr] = cellKey.split('-');
            const categoryIndex = parseInt(categoryStr, 10);
            const clueIndex = parseInt(indexStr, 10);
            
            if (this.isDailyDouble(categoryIndex, clueIndex)) {
                this.roundState.dailyDoublesRevealed.add(cellKey);
            }
        }
    }

    /**
     * Reset for new game
     */
    reset(newBoard: BoardData): void {
        this.originalBoard = { ...newBoard, categories: newBoard.categories.map(cat => ({ ...cat })) };
        this.roundState = this.initializeRound(1, newBoard);
    }

    // Private helper methods

    /**
     * Validate cell selection parameters
     */
    private validateCellSelection(categoryIndex: number, clueIndex: number): { valid: boolean; error?: string } {
        if (!Number.isInteger(categoryIndex) || !Number.isInteger(clueIndex)) {
            return { valid: false, error: 'Category and clue indices must be integers' };
        }

        if (!this.isValidCellPosition(categoryIndex, clueIndex)) {
            return { valid: false, error: 'Invalid cell position' };
        }

        return { valid: true };
    }

    /**
     * Check if a cell is available for selection
     */
    private isCellAvailable(categoryIndex: number, clueIndex: number): boolean {
        const cellKey = this.getCellKey(categoryIndex, clueIndex);
        return !this.roundState.usedCells.has(cellKey);
    }

    /**
     * Get clue data from board
     */
    private getClueData(categoryIndex: number, clueIndex: number): ClueData | null {
        const category = this.roundState.board.categories[categoryIndex];
        if (!category) return null;

        const clue = category.clues[clueIndex];
        return clue || null;
    }

    /**
     * Process cell selection and create result
     */
    private processCellSelection(
        categoryIndex: number,
        clueIndex: number,
        clueData: ClueData,
        pickerId: string
    ): ClueSelectionResult {
        const cellKey = this.getCellKey(categoryIndex, clueIndex);
        const isDailyDouble = this.isDailyDouble(categoryIndex, clueIndex);

        // Mark cell as used
        this.roundState.usedCells.add(cellKey);
        this.roundState.remainingClues--;

        // Create current clue data
        const currentClue: CurrentClueData = {
            category: categoryIndex,
            index: clueIndex,
            clue: clueData,
            isDailyDouble,
            pickerId: isDailyDouble ? pickerId : undefined,
            revealTime: Date.now()
        };

        this.roundState.currentClue = currentClue;

        // Mark Daily Double as revealed
        if (isDailyDouble) {
            this.roundState.dailyDoublesRevealed.add(cellKey);
        }

        logger.info(`Cell selected: ${cellKey}`, {
            component: 'RoundManager',
            categoryIndex,
            clueIndex,
            pickerId,
            isDailyDouble,
            value: clueData.value
        });

        return {
            success: true,
            clue: currentClue,
            isDailyDouble
        };
    }

    /**
     * Generate cell key for tracking used cells
     */
    private getCellKey(categoryIndex: number, clueIndex: number): string {
        return `${categoryIndex}-${clueIndex}`;
    }

    /**
     * Validate cell position
     */
    private isValidCellPosition(categoryIndex: number, clueIndex: number): boolean {
        return categoryIndex >= 0 &&
               categoryIndex < this.roundState.board.categories.length &&
               clueIndex >= 0 &&
               clueIndex < this.roundState.board.categories[categoryIndex].clues.length;
    }

    /**
     * Calculate total number of clues in board
     */
    private calculateTotalClues(board: BoardData): number {
        return board.categories.reduce((total, category) => total + category.clues.length, 0);
    }

    /**
     * Calculate remaining clues based on used cells
     */
    private calculateRemainingClues(): number {
        const totalClues = this.calculateTotalClues(this.roundState.board);
        return totalClues - this.roundState.usedCells.size;
    }

    /**
     * Create Round 2 board with doubled values
     */
    private createRound2Board(): BoardData {
        const round2Board: BoardData = {
            categories: this.originalBoard.categories.map(category => ({
                name: category.name,
                clues: category.clues.map(clue => ({
                    ...clue,
                    value: clue.value * 2 // Double the values for Round 2
                }))
            })),
            dailyDoubles: [...this.originalBoard.dailyDoubles] // Keep same DD positions
        };

        return round2Board;
    }

    /**
     * Get board statistics for display
     */
    getBoardStatistics(): {
        totalClues: number;
        usedClues: number;
        remainingClues: number;
        dailyDoublesTotal: number;
        dailyDoublesRevealed: number;
        completionPercent: number;
    } {
        const totalClues = this.calculateTotalClues(this.roundState.board);
        const usedClues = this.roundState.usedCells.size;
        
        return {
            totalClues,
            usedClues,
            remainingClues: this.roundState.remainingClues,
            dailyDoublesTotal: this.roundState.board.dailyDoubles.length,
            dailyDoublesRevealed: this.roundState.dailyDoublesRevealed.size,
            completionPercent: totalClues > 0 ? Math.round((usedClues / totalClues) * 100) : 0
        };
    }

    /**
     * Get current round number
     */
    getCurrentRound(): number {
        return this.roundState.round;
    }

    /**
     * Get current phase
     */
    getCurrentPhase(): GamePhase {
        return this.roundState.phase;
    }
}

export default RoundManager;