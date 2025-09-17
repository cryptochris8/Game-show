import { logger } from './Logger';

/**
 * Input validation and sanitization utilities
 * Prevents XSS, injection attacks, and ensures data integrity
 */
export class InputValidator {
    private static readonly MAX_STRING_LENGTH = 500;
    private static readonly MAX_ANSWER_LENGTH = 200;
    private static readonly MAX_USERNAME_LENGTH = 30;
    private static readonly MIN_USERNAME_LENGTH = 1;
    private static readonly MAX_WAGER = 1000000;
    private static readonly MIN_WAGER = 0;

    /**
     * Sanitize string input - remove dangerous characters
     */
    static sanitizeString(input: string, maxLength: number = InputValidator.MAX_STRING_LENGTH): string {
        if (typeof input !== 'string') {
            logger.warn('Invalid input type for sanitization', {
                component: 'InputValidator',
                inputType: typeof input
            });
            return '';
        }

        // Trim and limit length
        let sanitized = input.trim().substring(0, maxLength);

        // Remove control characters and potential script tags
        sanitized = sanitized
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
            .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
            .replace(/<[^>]*>/g, '') // Remove all HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+\s*=/gi, ''); // Remove event handlers

        return sanitized;
    }

    /**
     * Validate and sanitize trivia answer
     */
    static validateAnswer(answer: string): { valid: boolean; sanitized: string; error?: string } {
        if (typeof answer !== 'string') {
            return {
                valid: false,
                sanitized: '',
                error: 'Answer must be a string'
            };
        }

        const sanitized = InputValidator.sanitizeString(answer, InputValidator.MAX_ANSWER_LENGTH);

        if (sanitized.length === 0) {
            return {
                valid: false,
                sanitized: '',
                error: 'Answer cannot be empty'
            };
        }

        if (sanitized.length > InputValidator.MAX_ANSWER_LENGTH) {
            return {
                valid: false,
                sanitized: sanitized,
                error: `Answer too long (max ${InputValidator.MAX_ANSWER_LENGTH} characters)`
            };
        }

        return {
            valid: true,
            sanitized: sanitized
        };
    }

    /**
     * Validate and sanitize username
     */
    static validateUsername(username: string): { valid: boolean; sanitized: string; error?: string } {
        if (typeof username !== 'string') {
            return {
                valid: false,
                sanitized: '',
                error: 'Username must be a string'
            };
        }

        let sanitized = InputValidator.sanitizeString(username, InputValidator.MAX_USERNAME_LENGTH);

        // Additional username-specific sanitization
        sanitized = sanitized.replace(/[^a-zA-Z0-9_\-\s]/g, ''); // Allow only alphanumeric, underscore, dash, space

        if (sanitized.length < InputValidator.MIN_USERNAME_LENGTH) {
            return {
                valid: false,
                sanitized: '',
                error: 'Username too short'
            };
        }

        if (sanitized.length > InputValidator.MAX_USERNAME_LENGTH) {
            return {
                valid: false,
                sanitized: sanitized,
                error: `Username too long (max ${InputValidator.MAX_USERNAME_LENGTH} characters)`
            };
        }

        return {
            valid: true,
            sanitized: sanitized
        };
    }

    /**
     * Validate wager amount
     */
    static validateWager(wager: number, maxAllowed: number): { valid: boolean; value: number; error?: string } {
        if (typeof wager !== 'number' || isNaN(wager)) {
            return {
                valid: false,
                value: 0,
                error: 'Wager must be a number'
            };
        }

        const rounded = Math.floor(wager);

        if (rounded < InputValidator.MIN_WAGER) {
            return {
                valid: false,
                value: 0,
                error: 'Wager cannot be negative'
            };
        }

        if (rounded > maxAllowed) {
            return {
                valid: false,
                value: maxAllowed,
                error: `Wager exceeds maximum allowed (${maxAllowed})`
            };
        }

        if (rounded > InputValidator.MAX_WAGER) {
            return {
                valid: false,
                value: InputValidator.MAX_WAGER,
                error: `Wager exceeds absolute maximum (${InputValidator.MAX_WAGER})`
            };
        }

        return {
            valid: true,
            value: rounded
        };
    }

    /**
     * Validate cell selection
     */
    static validateCellSelection(categoryIndex: number, clueIndex: number): { valid: boolean; error?: string } {
        if (!Number.isInteger(categoryIndex) || !Number.isInteger(clueIndex)) {
            return {
                valid: false,
                error: 'Cell indices must be integers'
            };
        }

        if (categoryIndex < 0 || categoryIndex > 5) {
            return {
                valid: false,
                error: 'Invalid category index (must be 0-5)'
            };
        }

        if (clueIndex < 0 || clueIndex > 4) {
            return {
                valid: false,
                error: 'Invalid clue index (must be 0-4)'
            };
        }

        return { valid: true };
    }

    /**
     * Validate player ID
     */
    static validatePlayerId(playerId: string): boolean {
        if (typeof playerId !== 'string') return false;

        // Basic UUID-like validation (adjust based on HYTOPIA's actual ID format)
        const sanitized = InputValidator.sanitizeString(playerId, 100);
        return sanitized.length > 0 && sanitized.length <= 100;
    }

    /**
     * Sanitize chat message
     */
    static sanitizeChatMessage(message: string): string {
        const sanitized = InputValidator.sanitizeString(message, 200);

        // Additional chat-specific filtering
        const filtered = sanitized
            .replace(/\bhttps?:\/\/[^\s]+/gi, '[link]') // Replace URLs
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '[email]'); // Replace emails

        return filtered;
    }

    /**
     * Validate and sanitize UI event data
     */
    static validateUIEvent(eventType: string, payload: any): { valid: boolean; sanitizedPayload: any; error?: string } {
        // Whitelist of allowed event types
        const allowedEventTypes = [
            'SELECT_CELL', 'BUZZ', 'SUBMIT_ANSWER', 'SUBMIT_WAGER',
            'FINAL_WAGER', 'FINAL_ANSWER', 'START_GAME', 'PLAYER_READY',
            'GET_GAME_STATE', 'TOGGLE_MUSIC', 'TOGGLE_SFX', 'PLAY_SOUND',
            'START_SINGLE_PLAYER', 'START_MULTIPLAYER', 'LOAD_GAME_BOARD',
            'LOAD_INTRO_OVERLAY', 'INTRO_COMPLETE', 'ANSWER_SUBMIT',
            'START_INTRO_SEQUENCE', 'LOAD_MAIN_MENU'
        ];

        if (!allowedEventTypes.includes(eventType)) {
            return {
                valid: false,
                sanitizedPayload: {},
                error: `Invalid event type: ${eventType}`
            };
        }

        // Deep clone and sanitize payload
        let sanitizedPayload: any = {};

        try {
            if (typeof payload === 'object' && payload !== null) {
                sanitizedPayload = JSON.parse(JSON.stringify(payload)); // Deep clone

                // Recursively sanitize strings in payload
                const sanitizeObject = (obj: any): any => {
                    for (const key in obj) {
                        if (typeof obj[key] === 'string') {
                            obj[key] = InputValidator.sanitizeString(obj[key]);
                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                            sanitizeObject(obj[key]);
                        }
                    }
                    return obj;
                };

                sanitizedPayload = sanitizeObject(sanitizedPayload);
            }
        } catch (error) {
            logger.error('Failed to sanitize UI event payload', error as Error, {
                component: 'InputValidator',
                eventType
            });
            return {
                valid: false,
                sanitizedPayload: {},
                error: 'Invalid payload structure'
            };
        }

        return {
            valid: true,
            sanitizedPayload
        };
    }
}

/**
 * Rate limiting decorator for class methods
 */
export function rateLimit(maxCalls: number, windowMs: number) {
    const calls = new Map<string, number[]>();

    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function(...args: any[]) {
            // Extract player ID from first argument (assumes it's a player object or has an id)
            const playerId = args[0]?.id || args[0]?.playerId || 'unknown';
            const now = Date.now();

            // Get and filter recent calls
            const playerCalls = calls.get(playerId) || [];
            const recentCalls = playerCalls.filter(timestamp => now - timestamp < windowMs);

            // Check rate limit
            if (recentCalls.length >= maxCalls) {
                logger.warn(`Rate limit exceeded for ${propertyKey}`, {
                    component: target.constructor.name,
                    playerId,
                    method: propertyKey,
                    callsInWindow: recentCalls.length,
                    maxCalls,
                    windowMs
                });
                return null; // Return null instead of throwing to prevent client errors
            }

            // Update call history
            calls.set(playerId, [...recentCalls, now]);

            // Clean up old entries periodically
            if (Math.random() < 0.01) { // 1% chance to clean up
                const cutoff = now - windowMs;
                calls.forEach((timestamps, id) => {
                    const filtered = timestamps.filter(t => t > cutoff);
                    if (filtered.length === 0) {
                        calls.delete(id);
                    } else {
                        calls.set(id, filtered);
                    }
                });
            }

            // Call original method
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}