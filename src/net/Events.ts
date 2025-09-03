// Networking Events and Payloads for Clueboard Trivia Game
// Following HYTOPIA SDK event-driven architecture patterns

export enum ClueboardEvent {
    // Server -> Client Events
    GAME_STATE = 'GAME_STATE',
    CLUE_REVEAL = 'CLUE_REVEAL', 
    BUZZ_RESULT = 'BUZZ_RESULT',
    JUDGE = 'JUDGE',
    DAILY_DOUBLE_REVEAL = 'DAILY_DOUBLE_REVEAL',
    FINAL_ROUND = 'FINAL_ROUND',
    FINAL_REVEAL = 'FINAL_REVEAL',
    ROUND_COMPLETE = 'ROUND_COMPLETE',
    GAME_COMPLETE = 'GAME_COMPLETE',
    
    // Client -> Server Events  
    SELECT_CELL = 'SELECT_CELL',
    BUZZ = 'BUZZ',
    ANSWER_SUBMIT = 'ANSWER_SUBMIT',
    DAILY_DOUBLE_WAGER = 'DAILY_DOUBLE_WAGER',
    FINAL_WAGER = 'FINAL_WAGER',
    FINAL_ANSWER = 'FINAL_ANSWER'
}

export enum GamePhase {
    LOBBY = 'LOBBY',
    ROUND1 = 'ROUND1', 
    ROUND2 = 'ROUND2',
    FINAL = 'FINAL',
    RESULTS = 'RESULTS'
}

// Data Types
export interface ClueData {
    value: number;
    clue: string;
    answer: string;
}

export interface CategoryData {
    name: string;
    clues: ClueData[];
}

export interface DailyDoubleData {
    category: number;
    index: number;
}

export interface BoardData {
    categories: CategoryData[];
    dailyDoubles: DailyDoubleData[];
}

export interface PlayerData {
    id: string;
    name: string;
    score: number;
    stats: {
        correctAnswers: number;
        incorrectAnswers: number;
        buzzWins: number;
        averageBuzzTime: number;
        currentStreak: number;
    };
}

export interface GameStateData {
    phase: GamePhase;
    board: BoardData | null;
    usedCells: string[]; // Format: "category-index" 
    players: PlayerData[];
    currentPickerId: string | null;
    currentClue: CurrentClueData | null;
    lockoutUntil: number;
    buzzWindowEnd: number;
    message: string;
    round: number;
    timeRemaining: number;
}

export interface CurrentClueData {
    category: number;
    index: number;
    clue: ClueData;
    isDailyDouble: boolean;
    pickerId?: string;
    wager?: number;
    buzzWinnerId?: string;
    revealTime: number;
}

// Server -> Client Event Payloads
export interface GameStatePayload {
    gameState: GameStateData;
}

export interface ClueRevealPayload {
    category: string;
    value: number;
    text: string;
    isDailyDouble: boolean;
    pickerId?: string;
    maxWager?: number;
    lockoutMs: number;
    buzzWindowMs: number;
}

export interface BuzzResultPayload {
    winnerId: string;
    winnerName: string;
    buzzTime: number;
    lockedPlayers: string[];
}

export interface JudgePayload {
    playerId: string;
    playerName: string;
    answer: string;
    correct: boolean;
    correctAnswer: string;
    scoreChange: number;
    newScore: number;
    nextPickerId?: string;
}

export interface DailyDoubleRevealPayload {
    category: string;
    pickerId: string;
    pickerName: string;
    maxWager: number;
    currentScore: number;
}

export interface FinalRoundPayload {
    phase: 'wager' | 'answer' | 'results';
    category?: string;
    clue?: string;
    maxWager?: number;
    timeLimit?: number;
    results?: FinalResultsData[];
}

export interface FinalResultsData {
    playerId: string;
    playerName: string;
    wager: number;
    answer: string;
    correct: boolean;
    scoreChange: number;
    finalScore: number;
}

export interface RoundCompletePayload {
    round: number;
    nextRound?: number;
    scores: PlayerData[];
    message: string;
}

export interface GameCompletePayload {
    winner: PlayerData;
    finalScores: PlayerData[];
    gameStats: GameStatsData;
}

export interface GameStatsData {
    totalClues: number;
    dailyDoubles: number;
    perfectGames: number;
    averageScore: number;
    gameTime: number;
}

// Client -> Server Event Payloads  
export interface SelectCellPayload {
    category: number;
    index: number;
}

export interface BuzzPayload {
    timestamp: number;
    clientLatency?: number;
}

export interface AnswerSubmitPayload {
    answer: string;
    submitTime: number;
}

export interface DailyDoubleWagerPayload {
    wager: number;
}

export interface FinalWagerPayload {
    wager: number;
}

export interface FinalAnswerPayload {
    answer: string;
    submitTime: number;
}

// Event payload union types for type safety
export type ServerEventPayload = 
    | GameStatePayload
    | ClueRevealPayload  
    | BuzzResultPayload
    | JudgePayload
    | DailyDoubleRevealPayload
    | FinalRoundPayload
    | RoundCompletePayload
    | GameCompletePayload;

export type ClientEventPayload = 
    | SelectCellPayload
    | BuzzPayload
    | AnswerSubmitPayload
    | DailyDoubleWagerPayload
    | FinalWagerPayload
    | FinalAnswerPayload;

// Event data structure for HYTOPIA UI communication
export interface EventData<T = any> {
    type: ClueboardEvent;
    payload: T;
    timestamp: number;
    playerId?: string;
}

// Helper functions for creating event data
export function createServerEvent<T extends ServerEventPayload>(
    type: ClueboardEvent, 
    payload: T
): EventData<T> {
    return {
        type,
        payload,
        timestamp: Date.now()
    };
}

export function createClientEvent<T extends ClientEventPayload>(
    type: ClueboardEvent, 
    payload: T,
    playerId: string
): EventData<T> {
    return {
        type,
        payload,
        timestamp: Date.now(),
        playerId
    };
}

// Validation helpers
export function isValidClueCell(category: number, index: number): boolean {
    return category >= 0 && category < 6 && index >= 0 && index < 5;
}

export function isValidWager(wager: number, maxWager: number): boolean {
    return wager > 0 && wager <= maxWager && Number.isInteger(wager);
}

export function isValidAnswer(answer: string): boolean {
    return typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 200;
}

// Constants
export const BUZZ_LOCKOUT_MS = 300;
export const BUZZ_WINDOW_MS = 12000;
export const CLUE_DISPLAY_MS = 3000;
export const ANSWER_TIME_MS = 30000;
export const FINAL_WAGER_TIME_MS = 30000;
export const FINAL_ANSWER_TIME_MS = 30000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MIN_WAGER = 5;

// Rate limiting constants
export const BUZZ_RATE_LIMIT_MS = 600; // Anti-spam cooldown per player
export const MAX_BUZZES_PER_SECOND = 3;
export const MAX_EVENTS_PER_MINUTE = 60;