// PackLoader - Loads and validates question packs for Clueboard
// Ensures trivia packs meet game requirements and are properly formatted

import { promises as fs } from 'fs';
import { join } from 'path';
import type { BoardData, CategoryData, ClueData, DailyDoubleData } from '../net/Events';

export interface TriviaPackData {
    packId: string;
    title: string;
    categories: CategoryData[];
    dailyDoubles: DailyDoubleData[];
    finalRound: {
        category: string;
        clue: string;
        answer: string;
    };
    metadata?: {
        author?: string;
        version?: string;
        difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
        tags?: string[];
        description?: string;
    };
}

export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    packData?: TriviaPackData;
}

export interface LoadResult {
    success: boolean;
    boardData?: BoardData;
    finalRound?: TriviaPackData['finalRound'];
    packInfo?: {
        id: string;
        title: string;
        metadata?: TriviaPackData['metadata'];
    };
    error?: string;
    validationResult?: ValidationResult;
}

export class PackLoader {
    private static readonly REQUIRED_CATEGORIES = 6;
    private static readonly REQUIRED_CLUES_PER_CATEGORY = 5;
    private static readonly EXPECTED_VALUES = [100, 200, 300, 400, 500];
    private static readonly MIN_DAILY_DOUBLES = 1;
    private static readonly MAX_DAILY_DOUBLES = 3;

    /**
     * Load a trivia pack from file
     */
    static async loadPack(packPath: string): Promise<LoadResult> {
        try {
            // Read pack file
            const packContent = await fs.readFile(packPath, 'utf-8');
            const packData: TriviaPackData = JSON.parse(packContent);

            // Validate the pack
            const validationResult = this.validatePack(packData);

            if (!validationResult.valid) {
                return {
                    success: false,
                    error: 'Pack validation failed',
                    validationResult
                };
            }

            // Convert to game format
            const boardData = this.convertToBoard(packData);

            return {
                success: true,
                boardData,
                finalRound: packData.finalRound,
                packInfo: {
                    id: packData.packId,
                    title: packData.title,
                    metadata: packData.metadata
                },
                validationResult
            };

        } catch (error) {
            return {
                success: false,
                error: `Failed to load pack: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Load pack from assets directory by name
     */
    static async loadPackByName(packName: string): Promise<LoadResult> {
        const packPath = join(process.cwd(), 'assets', 'packs', `${packName}.json`);
        return this.loadPack(packPath);
    }

    /**
     * Load the default demo pack
     */
    static async loadDefaultPack(): Promise<LoadResult> {
        return this.loadPackByName('trivia_pack');
    }

    /**
     * Validate a trivia pack for correctness
     */
    static validatePack(packData: any): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];

        // Basic structure validation
        if (!packData || typeof packData !== 'object') {
            errors.push({
                field: 'root',
                message: 'Pack data must be an object',
                severity: 'error'
            });
            return { valid: false, errors, warnings };
        }

        // Required fields
        this.validateRequiredField(packData, 'packId', 'string', errors);
        this.validateRequiredField(packData, 'title', 'string', errors);
        this.validateRequiredField(packData, 'categories', 'object', errors);
        this.validateRequiredField(packData, 'dailyDoubles', 'object', errors);
        this.validateRequiredField(packData, 'finalRound', 'object', errors);

        if (errors.length > 0) {
            return { valid: false, errors, warnings };
        }

        // Categories validation
        this.validateCategories(packData.categories, errors, warnings);

        // Daily Doubles validation
        this.validateDailyDoubles(packData.dailyDoubles, packData.categories, errors, warnings);

        // Final Round validation
        this.validateFinalRound(packData.finalRound, errors, warnings);

        // Pack ID validation
        this.validatePackId(packData.packId, errors, warnings);

        // Content quality checks
        this.validateContentQuality(packData, warnings);

        const valid = errors.length === 0;
        return {
            valid,
            errors,
            warnings,
            packData: valid ? packData as TriviaPackData : undefined
        };
    }

    /**
     * Validate categories array
     */
    private static validateCategories(categories: any, errors: ValidationError[], warnings: ValidationError[]): void {
        if (!Array.isArray(categories)) {
            errors.push({
                field: 'categories',
                message: 'Categories must be an array',
                severity: 'error'
            });
            return;
        }

        if (categories.length !== this.REQUIRED_CATEGORIES) {
            errors.push({
                field: 'categories',
                message: `Must have exactly ${this.REQUIRED_CATEGORIES} categories, found ${categories.length}`,
                severity: 'error'
            });
        }

        // Validate each category
        categories.forEach((category, index) => {
            this.validateCategory(category, index, errors, warnings);
        });

        // Check for duplicate category names
        const categoryNames = categories.map(cat => cat?.name?.toLowerCase()).filter(Boolean);
        const uniqueNames = new Set(categoryNames);
        if (uniqueNames.size !== categoryNames.length) {
            warnings.push({
                field: 'categories',
                message: 'Duplicate category names found',
                severity: 'warning'
            });
        }
    }

    /**
     * Validate individual category
     */
    private static validateCategory(category: any, index: number, errors: ValidationError[], warnings: ValidationError[]): void {
        const field = `categories[${index}]`;

        if (!category || typeof category !== 'object') {
            errors.push({
                field,
                message: 'Category must be an object',
                severity: 'error'
            });
            return;
        }

        // Required fields
        this.validateRequiredField(category, 'name', 'string', errors, field);
        this.validateRequiredField(category, 'clues', 'object', errors, field);

        if (!Array.isArray(category.clues)) {
            errors.push({
                field: `${field}.clues`,
                message: 'Clues must be an array',
                severity: 'error'
            });
            return;
        }

        if (category.clues.length !== this.REQUIRED_CLUES_PER_CATEGORY) {
            errors.push({
                field: `${field}.clues`,
                message: `Must have exactly ${this.REQUIRED_CLUES_PER_CATEGORY} clues, found ${category.clues.length}`,
                severity: 'error'
            });
        }

        // Validate category name
        if (category.name && category.name.length > 15) {
            warnings.push({
                field: `${field}.name`,
                message: 'Category name is long and may not display well (15+ characters)',
                severity: 'warning'
            });
        }

        // Validate clues
        category.clues.forEach((clue: any, clueIndex: number) => {
            this.validateClue(clue, index, clueIndex, errors, warnings);
        });

        // Check clue values are in expected sequence
        if (category.clues.length === this.REQUIRED_CLUES_PER_CATEGORY) {
            const values = category.clues.map((clue: any) => clue?.value).sort((a: number, b: number) => a - b);
            const expectedValues = [...this.EXPECTED_VALUES].sort((a, b) => a - b);
            
            if (!this.arraysEqual(values, expectedValues)) {
                warnings.push({
                    field: `${field}.clues`,
                    message: `Expected values ${expectedValues.join(', ')}, found ${values.join(', ')}`,
                    severity: 'warning'
                });
            }
        }
    }

    /**
     * Validate individual clue
     */
    private static validateClue(clue: any, categoryIndex: number, clueIndex: number, errors: ValidationError[], warnings: ValidationError[]): void {
        const field = `categories[${categoryIndex}].clues[${clueIndex}]`;

        if (!clue || typeof clue !== 'object') {
            errors.push({
                field,
                message: 'Clue must be an object',
                severity: 'error'
            });
            return;
        }

        // Required fields
        this.validateRequiredField(clue, 'value', 'number', errors, field);
        this.validateRequiredField(clue, 'clue', 'string', errors, field);
        this.validateRequiredField(clue, 'answer', 'string', errors, field);

        // Value validation
        if (typeof clue.value === 'number') {
            if (clue.value <= 0 || !Number.isInteger(clue.value)) {
                errors.push({
                    field: `${field}.value`,
                    message: 'Clue value must be a positive integer',
                    severity: 'error'
                });
            }

            if (!this.EXPECTED_VALUES.includes(clue.value)) {
                warnings.push({
                    field: `${field}.value`,
                    message: `Unexpected clue value ${clue.value}, expected one of: ${this.EXPECTED_VALUES.join(', ')}`,
                    severity: 'warning'
                });
            }
        }

        // Content validation
        if (typeof clue.clue === 'string') {
            if (clue.clue.length < 10) {
                warnings.push({
                    field: `${field}.clue`,
                    message: 'Clue text seems very short (less than 10 characters)',
                    severity: 'warning'
                });
            }

            if (clue.clue.length > 200) {
                warnings.push({
                    field: `${field}.clue`,
                    message: 'Clue text is very long and may not display well',
                    severity: 'warning'
                });
            }
        }

        if (typeof clue.answer === 'string') {
            if (clue.answer.length < 2) {
                warnings.push({
                    field: `${field}.answer`,
                    message: 'Answer seems very short',
                    severity: 'warning'
                });
            }
        }
    }

    /**
     * Validate Daily Doubles configuration
     */
    private static validateDailyDoubles(dailyDoubles: any, categories: any[], errors: ValidationError[], warnings: ValidationError[]): void {
        if (!Array.isArray(dailyDoubles)) {
            errors.push({
                field: 'dailyDoubles',
                message: 'Daily Doubles must be an array',
                severity: 'error'
            });
            return;
        }

        if (dailyDoubles.length < this.MIN_DAILY_DOUBLES || dailyDoubles.length > this.MAX_DAILY_DOUBLES) {
            warnings.push({
                field: 'dailyDoubles',
                message: `Recommended ${this.MIN_DAILY_DOUBLES}-${this.MAX_DAILY_DOUBLES} Daily Doubles, found ${dailyDoubles.length}`,
                severity: 'warning'
            });
        }

        // Validate each Daily Double
        dailyDoubles.forEach((dd: any, index: number) => {
            const field = `dailyDoubles[${index}]`;

            if (!dd || typeof dd !== 'object') {
                errors.push({
                    field,
                    message: 'Daily Double must be an object',
                    severity: 'error'
                });
                return;
            }

            this.validateRequiredField(dd, 'category', 'number', errors, field);
            this.validateRequiredField(dd, 'index', 'number', errors, field);

            // Validate positions
            if (typeof dd.category === 'number' && typeof dd.index === 'number') {
                if (dd.category < 0 || dd.category >= this.REQUIRED_CATEGORIES) {
                    errors.push({
                        field: `${field}.category`,
                        message: `Category index ${dd.category} out of range (0-${this.REQUIRED_CATEGORIES - 1})`,
                        severity: 'error'
                    });
                }

                if (dd.index < 0 || dd.index >= this.REQUIRED_CLUES_PER_CATEGORY) {
                    errors.push({
                        field: `${field}.index`,
                        message: `Clue index ${dd.index} out of range (0-${this.REQUIRED_CLUES_PER_CATEGORY - 1})`,
                        severity: 'error'
                    });
                }
            }
        });

        // Check for duplicate Daily Double positions
        const positions = dailyDoubles
            .filter(dd => typeof dd.category === 'number' && typeof dd.index === 'number')
            .map(dd => `${dd.category}-${dd.index}`);
        const uniquePositions = new Set(positions);
        if (uniquePositions.size !== positions.length) {
            errors.push({
                field: 'dailyDoubles',
                message: 'Duplicate Daily Double positions found',
                severity: 'error'
            });
        }
    }

    /**
     * Validate Final Round configuration
     */
    private static validateFinalRound(finalRound: any, errors: ValidationError[], warnings: ValidationError[]): void {
        if (!finalRound || typeof finalRound !== 'object') {
            errors.push({
                field: 'finalRound',
                message: 'Final Round must be an object',
                severity: 'error'
            });
            return;
        }

        this.validateRequiredField(finalRound, 'category', 'string', errors, 'finalRound');
        this.validateRequiredField(finalRound, 'clue', 'string', errors, 'finalRound');
        this.validateRequiredField(finalRound, 'answer', 'string', errors, 'finalRound');

        // Content validation
        if (typeof finalRound.clue === 'string' && finalRound.clue.length < 15) {
            warnings.push({
                field: 'finalRound.clue',
                message: 'Final Round clue seems short',
                severity: 'warning'
            });
        }
    }

    /**
     * Validate pack ID format
     */
    private static validatePackId(packId: string, errors: ValidationError[], warnings: ValidationError[]): void {
        const validIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/;
        
        if (packId.length < 3) {
            warnings.push({
                field: 'packId',
                message: 'Pack ID should be at least 3 characters long',
                severity: 'warning'
            });
        }

        if (!validIdPattern.test(packId)) {
            warnings.push({
                field: 'packId',
                message: 'Pack ID should contain only letters, numbers, hyphens, and underscores',
                severity: 'warning'
            });
        }
    }

    /**
     * Validate content quality
     */
    private static validateContentQuality(packData: TriviaPackData, warnings: ValidationError[]): void {
        // Check for placeholder content
        const placeholderTerms = ['test', 'example', 'placeholder', 'todo', 'fix me'];
        
        packData.categories.forEach((category, catIndex) => {
            category.clues.forEach((clue, clueIndex) => {
                const content = `${clue.clue} ${clue.answer}`.toLowerCase();
                
                for (const term of placeholderTerms) {
                    if (content.includes(term)) {
                        warnings.push({
                            field: `categories[${catIndex}].clues[${clueIndex}]`,
                            message: `Possible placeholder content detected: "${term}"`,
                            severity: 'warning'
                        });
                        break;
                    }
                }
            });
        });
    }

    /**
     * Convert pack data to board format
     */
    private static convertToBoard(packData: TriviaPackData): BoardData {
        return {
            categories: packData.categories.map(category => ({
                name: category.name.toUpperCase(),
                clues: [...category.clues] // Copy clues
            })),
            dailyDoubles: [...packData.dailyDoubles] // Copy Daily Doubles
        };
    }

    /**
     * Validate required field
     */
    private static validateRequiredField(
        obj: any, 
        field: string, 
        expectedType: string, 
        errors: ValidationError[], 
        parentField?: string
    ): void {
        const fullField = parentField ? `${parentField}.${field}` : field;
        
        if (!(field in obj)) {
            errors.push({
                field: fullField,
                message: `Missing required field: ${field}`,
                severity: 'error'
            });
            return;
        }

        const actualType = Array.isArray(obj[field]) ? 'array' : typeof obj[field];
        
        if (actualType !== expectedType) {
            errors.push({
                field: fullField,
                message: `Expected ${expectedType}, got ${actualType}`,
                severity: 'error'
            });
        }
    }

    /**
     * Check if two arrays are equal
     */
    private static arraysEqual(a: any[], b: any[]): boolean {
        return a.length === b.length && a.every((val, i) => val === b[i]);
    }

    /**
     * List available packs in the packs directory
     */
    static async listAvailablePacks(): Promise<string[]> {
        try {
            const packsDir = join(process.cwd(), 'assets', 'packs');
            const files = await fs.readdir(packsDir);
            
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        } catch (error) {
            console.warn('Could not list available packs:', error);
            return [];
        }
    }

    /**
     * Get pack metadata without full validation
     */
    static async getPackMetadata(packPath: string): Promise<{ id: string; title: string; metadata?: any } | null> {
        try {
            const packContent = await fs.readFile(packPath, 'utf-8');
            const packData = JSON.parse(packContent);
            
            return {
                id: packData.packId || 'unknown',
                title: packData.title || 'Unknown Pack',
                metadata: packData.metadata
            };
        } catch (error) {
            return null;
        }
    }
}

export default PackLoader;