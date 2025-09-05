// Answer Normalization System for Clueboard
// Handles case-insensitive matching, article stripping, and fuzzy matching

import { logger } from '../util/Logger';

export interface NormalizationResult {
    normalized: string;
    original: string;
    confidence: number; // 0-1 score for match quality
}

export interface MatchResult {
    isMatch: boolean;
    confidence: number;
    normalizedAnswer: string;
    normalizedCorrect: string;
    partialMatch?: boolean;
}

export interface NormalizationConfig {
    enableFuzzyMatching: boolean;
    fuzzyThreshold: number;
    enablePartialMatching: boolean;
    partialMatchThreshold: number;
    maxAnswerLength: number;
    minAnswerLength: number;
}

// Normalization constants
const NORMALIZATION_CONSTANTS = {
    ARTICLES: ['a', 'an', 'the'],
    JEOPARDY_PREFIXES: [
        'what is', 'what are', 'what was', 'what were',
        'who is', 'who are', 'who was', 'who were',
        'where is', 'where are', 'where was', 'where were',
        'when is', 'when are', 'when was', 'when were',
        'why is', 'why are', 'why was', 'why were',
        'how is', 'how are', 'how was', 'how were'
    ],
    PUNCTUATION_REGEX: /[^\w\s]/g,
    WHITESPACE_REGEX: /\s+/g,
    DEFAULT_CONFIG: {
        enableFuzzyMatching: true,
        fuzzyThreshold: 0.85,
        enablePartialMatching: true,
        partialMatchThreshold: 0.7,
        maxAnswerLength: 200,
        minAnswerLength: 1
    } as NormalizationConfig
} as const;

export class AnswerNormalizer {
    private config: NormalizationConfig;

    constructor(config: Partial<NormalizationConfig> = {}) {
        this.config = { ...NORMALIZATION_CONSTANTS.DEFAULT_CONFIG, ...config };
    }

    /**
     * Normalize a single answer string
     */
    static normalize(answer: string): NormalizationResult {
        try {
            const original = answer;

            // Validate input
            if (typeof answer !== 'string') {
                throw new Error('Answer must be a string');
            }

            let normalized = answer.toLowerCase().trim();

            // Check length constraints
            if (normalized.length > NORMALIZATION_CONSTANTS.DEFAULT_CONFIG.maxAnswerLength) {
                logger.warn('Answer exceeds maximum length, truncating', {
                    component: 'AnswerNormalizer',
                    originalLength: normalized.length,
                    maxLength: NORMALIZATION_CONSTANTS.DEFAULT_CONFIG.maxAnswerLength
                });
                normalized = normalized.substring(0, NORMALIZATION_CONSTANTS.DEFAULT_CONFIG.maxAnswerLength);
            }

            // Remove punctuation except spaces and letters/numbers
            normalized = normalized.replace(NORMALIZATION_CONSTANTS.PUNCTUATION_REGEX, ' ');

            // Collapse multiple whitespace
            normalized = normalized.replace(NORMALIZATION_CONSTANTS.WHITESPACE_REGEX, ' ').trim();

            // Remove Jeopardy-style prefixes
            normalized = this.removeJeopardyPrefixes(normalized);

            // Remove leading articles
            normalized = this.removeLeadingArticles(normalized);

            // Final cleanup
            normalized = normalized.trim();

            return {
                normalized,
                original,
                confidence: 1.0 // Perfect normalization confidence
            };
        } catch (error) {
            logger.error('Error normalizing answer', error as Error, {
                component: 'AnswerNormalizer',
                answer: typeof answer === 'string' ? answer.substring(0, 100) : 'non-string'
            });

            // Return safe fallback
            return {
                normalized: '',
                original: typeof answer === 'string' ? answer : '',
                confidence: 0
            };
        }
    }

    /**
     * Check if two answers match using normalization
     */
    static checkMatch(playerAnswer: string, correctAnswer: string, fuzzyThreshold: number = 1): MatchResult {
        const startTime = Date.now();

        try {
            const playerNorm = this.normalize(playerAnswer);
            const correctNorm = this.normalize(correctAnswer);

            // Exact match after normalization
            if (playerNorm.normalized === correctNorm.normalized) {
                logger.debug('Exact match found', {
                    component: 'AnswerNormalizer',
                    playerAnswer: playerNorm.original.substring(0, 50),
                    correctAnswer: correctNorm.original.substring(0, 50),
                    confidence: 1.0
                });

                return {
                    isMatch: true,
                    confidence: 1.0,
                    normalizedAnswer: playerNorm.normalized,
                    normalizedCorrect: correctNorm.normalized
                };
            }

            // Fuzzy matching using Levenshtein distance
            if (fuzzyThreshold > 0) {
                const distance = this.levenshteinDistance(playerNorm.normalized, correctNorm.normalized);
                const maxLength = Math.max(playerNorm.normalized.length, correctNorm.normalized.length);
                const similarity = 1 - (distance / maxLength);

                // Allow small typos based on length
                const allowedDistance = Math.min(fuzzyThreshold, Math.ceil(maxLength * 0.15)); // Max 15% error

                if (distance <= allowedDistance && similarity >= 0.8) {
                    logger.debug('Fuzzy match found', {
                        component: 'AnswerNormalizer',
                        playerAnswer: playerNorm.original.substring(0, 50),
                        correctAnswer: correctNorm.original.substring(0, 50),
                        distance,
                        similarity,
                        confidence: similarity
                    });

                    return {
                        isMatch: true,
                        confidence: similarity,
                        normalizedAnswer: playerNorm.normalized,
                        normalizedCorrect: correctNorm.normalized
                    };
                }
            }

            // Check for partial matches (player answer contained in correct or vice versa)
            const partialMatch = this.checkPartialMatch(playerNorm.normalized, correctNorm.normalized);
            if (partialMatch.isMatch) {
                logger.debug('Partial match found', {
                    component: 'AnswerNormalizer',
                    playerAnswer: playerNorm.original.substring(0, 50),
                    correctAnswer: correctNorm.original.substring(0, 50),
                    confidence: partialMatch.confidence
                });

                return { ...partialMatch, partialMatch: true };
            }

            // No match found
            const processingTime = Date.now() - startTime;
            logger.debug('No match found', {
                component: 'AnswerNormalizer',
                playerAnswer: playerNorm.original.substring(0, 50),
                correctAnswer: correctNorm.original.substring(0, 50),
                processingTimeMs: processingTime
            });

            return {
                isMatch: false,
                confidence: 0,
                normalizedAnswer: playerNorm.normalized,
                normalizedCorrect: correctNorm.normalized
            };

        } catch (error) {
            logger.error('Error checking answer match', error as Error, {
                component: 'AnswerNormalizer',
                playerAnswer: typeof playerAnswer === 'string' ? playerAnswer.substring(0, 50) : 'invalid',
                correctAnswer: typeof correctAnswer === 'string' ? correctAnswer.substring(0, 50) : 'invalid'
            });

            return {
                isMatch: false,
                confidence: 0,
                normalizedAnswer: '',
                normalizedCorrect: ''
            };
        }
    }

    /**
     * Remove Jeopardy-style question prefixes
     */
    private static removeJeopardyPrefixes(text: string): string {
        const words = text.split(' ');

        for (const prefix of NORMALIZATION_CONSTANTS.JEOPARDY_PREFIXES) {
            const prefixWords = prefix.split(' ');

            if (words.length >= prefixWords.length) {
                const textPrefix = words.slice(0, prefixWords.length).join(' ');

                if (textPrefix === prefix) {
                    return words.slice(prefixWords.length).join(' ');
                }
            }
        }

        return text;
    }

    /**
     * Remove leading articles (a, an, the)
     */
        private static removeLeadingArticles(text: string): string {
        const words = text.split(' ');

        if (words.length > 1 && NORMALIZATION_CONSTANTS.ARTICLES.includes(words[0] as any)) {
            return words.slice(1).join(' ');
        }

        return text;
    }

    /**
     * Calculate Levenshtein distance between two strings (optimized)
     */
    private static levenshteinDistance(str1: string, str2: string): number {
        // Handle edge cases
        if (str1 === str2) return 0;
        if (str1.length === 0) return str2.length;
        if (str2.length === 0) return str1.length;

        // Ensure str1 is the shorter string for optimization
        if (str1.length > str2.length) {
            [str1, str2] = [str2, str1];
        }

        const len1 = str1.length;
        const len2 = str2.length;

        // Use two arrays instead of full matrix for memory efficiency
        let previousRow = new Array(len1 + 1);
        let currentRow = new Array(len1 + 1);

        // Initialize first row
        for (let i = 0; i <= len1; i++) {
            previousRow[i] = i;
        }

        // Calculate distance
        for (let j = 1; j <= len2; j++) {
            currentRow[0] = j;

            for (let i = 1; i <= len1; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                currentRow[i] = Math.min(
                    currentRow[i - 1] + 1,      // deletion
                    previousRow[i] + 1,         // insertion
                    previousRow[i - 1] + cost   // substitution
                );
            }

            // Swap rows
            [previousRow, currentRow] = [currentRow, previousRow];
        }

        return previousRow[len1];
    }

    /**
     * Check for partial matches where one answer is contained in the other
     */
    private static checkPartialMatch(playerAnswer: string, correctAnswer: string): MatchResult {
        const playerWords = playerAnswer.split(' ').filter(word => word.length > 0);
        const correctWords = correctAnswer.split(' ').filter(word => word.length > 0);
        
        // Skip partial matching for very short answers
        if (Math.min(playerWords.length, correctWords.length) < 2) {
            return { isMatch: false, confidence: 0, normalizedAnswer: playerAnswer, normalizedCorrect: correctAnswer };
        }
        
        // Check if player answer contains all words from correct answer
        const playerWordsSet = new Set(playerWords);
        const correctWordsSet = new Set(correctWords);
        
        const playerInCorrect = correctWords.every(word => playerWordsSet.has(word));
        const correctInPlayer = playerWords.every(word => correctWordsSet.has(word));
        
        if (playerInCorrect || correctInPlayer) {
            // Calculate confidence based on word overlap
            const intersection = new Set([...playerWordsSet].filter(word => correctWordsSet.has(word)));
            const union = new Set([...playerWordsSet, ...correctWordsSet]);
            const confidence = intersection.size / union.size;
            
            // Only accept if confidence is high enough
            if (confidence >= 0.7) {
                return {
                    isMatch: true,
                    confidence: confidence * 0.9, // Slightly lower confidence for partial matches
                    normalizedAnswer: playerAnswer,
                    normalizedCorrect: correctAnswer
                };
            }
        }
        
        return { isMatch: false, confidence: 0, normalizedAnswer: playerAnswer, normalizedCorrect: correctAnswer };
    }

    /**
     * Batch normalize multiple answers
     */
    static normalizeAll(answers: string[]): NormalizationResult[] {
        return answers.map(answer => this.normalize(answer));
    }

    /**
     * Find the best match from multiple possible correct answers
     */
    static findBestMatch(playerAnswer: string, correctAnswers: string[], fuzzyThreshold: number = 1): MatchResult & { bestAnswer?: string } {
        let bestMatch: MatchResult & { bestAnswer?: string } = {
            isMatch: false,
            confidence: 0,
            normalizedAnswer: this.normalize(playerAnswer).normalized,
            normalizedCorrect: '',
            bestAnswer: undefined
        };
        
        for (const correctAnswer of correctAnswers) {
            const matchResult = this.checkMatch(playerAnswer, correctAnswer, fuzzyThreshold);
            
            if (matchResult.isMatch && matchResult.confidence > bestMatch.confidence) {
                bestMatch = {
                    ...matchResult,
                    bestAnswer: correctAnswer
                };
            }
        }
        
        if (!bestMatch.isMatch && correctAnswers.length > 0) {
            // Return the first correct answer as the normalized version for display
            bestMatch.normalizedCorrect = this.normalize(correctAnswers[0]).normalized;
        }
        
        return bestMatch;
    }

    /**
     * Validate that an answer is reasonable (length, content checks)
     */
    static validateAnswer(answer: string): { valid: boolean; reason?: string } {
        const config = NORMALIZATION_CONSTANTS.DEFAULT_CONFIG;

        if (!answer || typeof answer !== 'string') {
            return { valid: false, reason: 'Answer must be a string' };
        }

        const trimmed = answer.trim();

        if (trimmed.length === 0) {
            return { valid: false, reason: 'Answer cannot be empty' };
        }

        if (trimmed.length > config.maxAnswerLength) {
            return { valid: false, reason: `Answer is too long (max ${config.maxAnswerLength} characters)` };
        }

        if (trimmed.length < config.minAnswerLength) {
            return { valid: false, reason: 'Answer is too short' };
        }

        // Check for reasonable content (not just punctuation or numbers)
        const hasLetters = /[a-zA-Z]/.test(trimmed);
        if (!hasLetters) {
            return { valid: false, reason: 'Answer must contain at least one letter' };
        }

        return { valid: true };
    }

    /**
     * Get match confidence as percentage
     */
    static getMatchConfidencePercent(matchResult: MatchResult): number {
        return Math.round(matchResult.confidence * 100);
    }

    /**
     * Get normalization statistics for monitoring
     */
    static getNormalizationStats(): {
        supportedPrefixes: number;
        supportedArticles: number;
        config: NormalizationConfig;
    } {
        return {
            supportedPrefixes: NORMALIZATION_CONSTANTS.JEOPARDY_PREFIXES.length,
            supportedArticles: NORMALIZATION_CONSTANTS.ARTICLES.length,
            config: NORMALIZATION_CONSTANTS.DEFAULT_CONFIG
        };
    }

    /**
     * Quick validation for multiple answers
     */
    static validateAnswers(answers: string[]): Array<{ valid: boolean; reason?: string; index: number }> {
        return answers.map((answer, index) => ({
            ...this.validateAnswer(answer),
            index
        }));
    }

    /**
     * Normalize multiple answers efficiently
     */
    static normalizeBatch(answers: string[]): NormalizationResult[] {
        return answers.map(answer => this.normalize(answer));
    }

    /**
     * Compare multiple player answers against multiple correct answers
     */
    static findBestMatches(
        playerAnswers: string[],
        correctAnswers: string[],
        fuzzyThreshold: number = 1
    ): Array<MatchResult & { playerIndex: number; bestCorrectAnswer?: string }> {
        return playerAnswers.map((playerAnswer, index) => {
            const bestMatch = this.findBestMatch(playerAnswer, correctAnswers, fuzzyThreshold);
            return {
                ...bestMatch,
                playerIndex: index
            };
        });
    }
}

// Export convenience functions
export const normalize = AnswerNormalizer.normalize;
export const checkMatch = AnswerNormalizer.checkMatch;
export const validateAnswer = AnswerNormalizer.validateAnswer;
export const findBestMatch = AnswerNormalizer.findBestMatch;
export const normalizeBatch = AnswerNormalizer.normalizeBatch;
export const validateAnswers = AnswerNormalizer.validateAnswers;
export const findBestMatches = AnswerNormalizer.findBestMatches;