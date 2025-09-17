/**
 * ChoiceGenerator - Automatically generates multiple choice options for trivia questions
 * This ensures all new questions have properly formatted choices with:
 * - One correct answer
 * - Two plausible wrong answers
 * - One humorous/obviously wrong answer
 */

import { ClueData } from '../net/Events';

interface ChoiceGeneratorOptions {
    includeHumor?: boolean;
    shuffleChoices?: boolean;
}

export class ChoiceGenerator {
    // Category-specific wrong answer pools
    private static readonly WRONG_ANSWERS = {
        SPORTS: {
            plausible: [
                'Football', 'Basketball', 'Baseball', 'Soccer', 'Tennis', 'Golf', 'Hockey',
                'Cricket', 'Rugby', 'Boxing', 'Wrestling', 'Track and Field', 'Swimming',
                'Volleyball', 'Badminton', 'Table Tennis', 'Cycling', 'Skiing', 'Surfing',
                'Gymnastics', 'Figure Skating', 'Marathon', 'Triathlon', 'Archery',
                'the Lakers', 'the Yankees', 'the Patriots', 'Manchester United',
                'Tiger Woods', 'Michael Jordan', 'LeBron James', 'Tom Brady', 'Serena Williams',
                'Muhammad Ali', 'Babe Ruth', 'Wayne Gretzky', 'Lionel Messi', 'Roger Federer'
            ],
            humorous: [
                'Extreme ironing', 'Competitive napping', 'Professional couch surfing',
                'Synchronized swimming (but on land)', 'Speed walking... but backwards',
                'Angry Birds (real life version)', 'Competitive eating', 'Thumb wrestling',
                'Rock paper scissors championship', 'Professional hide and seek',
                'Extreme knitting', 'Competitive Netflix watching', 'Fantasy football arguing'
            ]
        },
        SCIENCE: {
            plausible: [
                'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 'Helium', 'Iron',
                'Gold', 'Silver', 'Mercury', 'Uranium', 'Plutonium', 'Carbon',
                'Photosynthesis', 'Mitosis', 'Evolution', 'Gravity', 'Magnetism',
                'Albert Einstein', 'Isaac Newton', 'Marie Curie', 'Charles Darwin',
                'Stephen Hawking', 'Galileo', 'the brain', 'the heart', 'the liver',
                'Mars', 'Venus', 'Jupiter', 'Saturn', 'Neptune', 'Physics', 'Chemistry'
            ],
            humorous: [
                'Magic', 'The Force', 'Unicorn tears', 'Dragon breath',
                'That thing from Star Trek', 'YouTube physics', 'Flat Earth theory',
                'Essential oils', 'Mercury in retrograde', 'Bad vibes',
                'The mitochondria (powerhouse of everything)', 'Science stuff',
                'Whatever my horoscope says', 'Crystals and positive energy'
            ]
        },
        MOVIES: {
            plausible: [
                'Star Wars', 'Avatar', 'Titanic', 'The Godfather', 'Jurassic Park',
                'The Lion King', 'Toy Story', 'Batman', 'Spider-Man', 'Iron Man',
                'Tom Hanks', 'Leonardo DiCaprio', 'Brad Pitt', 'Meryl Streep',
                'Robert Downey Jr.', 'Steven Spielberg', 'Christopher Nolan',
                'Martin Scorsese', 'James Cameron', 'Pixar', 'Marvel', 'Disney'
            ],
            humorous: [
                'That movie with that guy', 'The one where they blow stuff up',
                'Nicolas Cage (every answer is Nicolas Cage)', 'A Marvel movie (pick any)',
                'Fast & Furious 47', 'Home videos from 1993', 'My cousin\'s wedding video',
                'That movie everyone pretends to have seen', 'The Netflix adaptation',
                'The sequel nobody asked for', 'A Michael Bay explosion fest'
            ]
        },
        GEOGRAPHY: {
            plausible: [
                'United States', 'China', 'Russia', 'India', 'Brazil', 'Canada',
                'France', 'Germany', 'United Kingdom', 'Japan', 'Australia',
                'Paris', 'London', 'Tokyo', 'New York', 'Moscow', 'Beijing',
                'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean',
                'Mount Everest', 'Amazon River', 'Nile River', 'Sahara Desert'
            ],
            humorous: [
                'Middle Earth', 'Narnia', 'Atlantis', 'Your mom\'s house',
                'That place on the map', 'Somewhere over the rainbow',
                'The upside down', 'Platform 9¾', 'Westeros', 'Springfield',
                'Where Carmen Sandiego is', 'GPS says "recalculating"',
                'The place I can never pronounce correctly'
            ]
        },
        HISTORY: {
            plausible: [
                'George Washington', 'Abraham Lincoln', 'Thomas Jefferson',
                'Napoleon', 'Julius Caesar', 'Cleopatra', 'Alexander the Great',
                'World War I', 'World War II', 'The Civil War', 'Revolutionary War',
                'The Renaissance', 'Industrial Revolution', 'The Cold War',
                '1776', '1492', '1945', '1969', 'Rome', 'Greece', 'Egypt'
            ],
            humorous: [
                'Last Tuesday', 'The day before yesterday', 'That time in band camp',
                'When the Fire Nation attacked', 'The great meme war of 2016',
                'When dial-up internet was fast', 'The MySpace era',
                'Before Netflix existed', 'When phones had cords',
                'The dark ages (before WiFi)', 'Y2K panic', 'Ancient aliens did it'
            ]
        },
        'POP CULTURE': {
            plausible: [
                'TikTok', 'Instagram', 'Twitter/X', 'YouTube', 'Facebook',
                'Taylor Swift', 'Beyoncé', 'Drake', 'Ariana Grande', 'The Weeknd',
                'Netflix', 'Disney+', 'HBO', 'Marvel', 'Star Wars', 'Friends',
                'The Office', 'Game of Thrones', 'Breaking Bad', 'Stranger Things',
                'Fortnite', 'Minecraft', 'Among Us', 'Call of Duty', 'iPhone'
            ],
            humorous: [
                'Whatever the kids are into these days', 'That thing everyone\'s obsessed with',
                'The app I\'m too old to understand', 'Influencer nonsense',
                'That dance everyone\'s doing', 'The meme of the week',
                'Celebrity drama I don\'t care about', 'OK Boomer',
                'Something something crypto', 'The metaverse (whatever that is)',
                'That thing that was cool 5 minutes ago', 'Kardashian something'
            ]
        }
    };

    /**
     * Generate multiple choice options for a clue
     */
    public static generateChoices(
        clue: ClueData,
        category: string,
        options: ChoiceGeneratorOptions = { includeHumor: true, shuffleChoices: true }
    ): { choices: string[], correctChoice: number } {
        // Extract the clean answer (remove "What is", "Who is", etc.)
        const cleanAnswer = this.extractCleanAnswer(clue.answer);

        // Get wrong answers for this category
        const wrongAnswers = this.getWrongAnswers(cleanAnswer, category, options.includeHumor);

        // Combine correct answer with wrong answers
        let choices = [cleanAnswer, ...wrongAnswers];
        let correctChoice = 0;

        // Shuffle if requested (remembering the correct answer position)
        if (options.shuffleChoices) {
            const shuffled = this.shuffleWithCorrectIndex(choices);
            choices = shuffled.choices;
            correctChoice = shuffled.correctIndex;
        }

        return { choices, correctChoice };
    }

    /**
     * Extract clean answer from Jeopardy-style format
     */
    private static extractCleanAnswer(answer: string): string {
        // Remove common Jeopardy prefixes
        const prefixes = [
            'What is ', 'What are ', 'Who is ', 'Who are ',
            'Where is ', 'When is ', 'Why is ', 'How is ',
            'What was ', 'Who was ', 'Where was ', 'When was '
        ];

        let cleanAnswer = answer;
        for (const prefix of prefixes) {
            if (answer.toLowerCase().startsWith(prefix.toLowerCase())) {
                cleanAnswer = answer.substring(prefix.length);
                break;
            }
        }

        // Remove trailing question mark and clean up
        cleanAnswer = cleanAnswer.replace(/\?$/, '').trim();

        // Capitalize first letter if needed
        return cleanAnswer.charAt(0).toUpperCase() + cleanAnswer.slice(1);
    }

    /**
     * Get appropriate wrong answers for the category
     */
    private static getWrongAnswers(
        correctAnswer: string,
        category: string,
        includeHumor: boolean = true
    ): string[] {
        const categoryAnswers = this.WRONG_ANSWERS[category] || this.getGenericWrongAnswers();
        const wrongAnswers: string[] = [];

        // Get 2 plausible wrong answers
        const plausiblePool = categoryAnswers.plausible.filter(
            answer => answer.toLowerCase() !== correctAnswer.toLowerCase()
        );

        // Randomly select 2 plausible answers
        for (let i = 0; i < 2 && plausiblePool.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * plausiblePool.length);
            wrongAnswers.push(plausiblePool[randomIndex]);
            plausiblePool.splice(randomIndex, 1);
        }

        // Add 1 humorous answer if requested
        if (includeHumor && categoryAnswers.humorous) {
            const humorousPool = categoryAnswers.humorous;
            const randomIndex = Math.floor(Math.random() * humorousPool.length);
            wrongAnswers.push(humorousPool[randomIndex]);
        } else {
            // Add another plausible answer if no humor requested
            if (plausiblePool.length > 0) {
                const randomIndex = Math.floor(Math.random() * plausiblePool.length);
                wrongAnswers.push(plausiblePool[randomIndex]);
            }
        }

        // Ensure we have exactly 3 wrong answers
        while (wrongAnswers.length < 3) {
            wrongAnswers.push(this.getRandomGenericAnswer());
        }

        return wrongAnswers.slice(0, 3);
    }

    /**
     * Get generic wrong answers if category not found
     */
    private static getGenericWrongAnswers(): any {
        return {
            plausible: [
                '42', 'The answer', 'Yes', 'No', 'Maybe', 'All of the above',
                'None of the above', 'Both A and B', 'It depends', 'Unknown'
            ],
            humorous: [
                'Your guess is as good as mine', 'Ask Google', '¯\\_(ツ)_/¯',
                'The friends we made along the way', 'Plot twist: there is no answer',
                'Error 404: Answer not found', 'Banana for scale'
            ]
        };
    }

    /**
     * Get a random generic answer
     */
    private static getRandomGenericAnswer(): string {
        const generic = [
            'Something else', 'Another option', 'Alternative answer',
            'Different choice', 'Other', 'Not sure'
        ];
        return generic[Math.floor(Math.random() * generic.length)];
    }

    /**
     * Shuffle choices while keeping track of correct answer
     */
    private static shuffleWithCorrectIndex(
        choices: string[]
    ): { choices: string[], correctIndex: number } {
        const correctAnswer = choices[0];
        const shuffled = [...choices];

        // Fisher-Yates shuffle
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Find where the correct answer ended up
        const correctIndex = shuffled.indexOf(correctAnswer);

        return { choices: shuffled, correctIndex };
    }

    /**
     * Process an entire trivia pack to add choices
     */
    public static processTriviaPack(pack: any, options?: ChoiceGeneratorOptions): any {
        const processedPack = { ...pack };

        // Process each category
        processedPack.categories = pack.categories.map((category: any) => ({
            ...category,
            clues: category.clues.map((clue: ClueData) => {
                // Skip if already has choices
                if (clue.choices && clue.correctChoice !== undefined) {
                    return clue;
                }

                // Generate choices
                const { choices, correctChoice } = this.generateChoices(
                    clue,
                    category.name,
                    options
                );

                return {
                    ...clue,
                    choices,
                    correctChoice
                };
            })
        }));

        // Process final round if exists
        if (pack.finalRound && !pack.finalRound.choices) {
            const { choices, correctChoice } = this.generateChoices(
                pack.finalRound,
                'FINAL',
                options
            );
            processedPack.finalRound = {
                ...pack.finalRound,
                choices,
                correctChoice
            };
        }

        return processedPack;
    }
}

export default ChoiceGenerator;