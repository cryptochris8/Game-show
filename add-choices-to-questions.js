#!/usr/bin/env node

/**
 * Script to automatically add multiple choice options to trivia questions
 * Run this after adding new questions to ensure they have proper choices
 *
 * Usage: node add-choices-to-questions.js [packFile]
 * Example: node add-choices-to-questions.js assets/packs/trivia_pack.json
 */

const fs = require('fs');
const path = require('path');

// Default pack file
const DEFAULT_PACK_FILE = 'assets/packs/trivia_pack.json';

// Category-specific wrong answer pools (same as ChoiceGenerator.ts)
const WRONG_ANSWERS = {
    SPORTS: {
        plausible: [
            'Football', 'Basketball', 'Baseball', 'Soccer', 'Tennis', 'Golf', 'Hockey',
            'Cricket', 'Rugby', 'Boxing', 'Wrestling', 'Track and Field', 'Swimming',
            'Volleyball', 'Badminton', 'the Lakers', 'the Yankees', 'Tiger Woods',
            'Michael Jordan', 'LeBron James', 'Tom Brady', 'Serena Williams'
        ],
        humorous: [
            'Extreme ironing', 'Competitive napping', 'Professional couch surfing',
            'Angry Birds (real life version)', 'Competitive eating', 'Thumb wrestling',
            'Professional hide and seek', 'Extreme knitting'
        ]
    },
    SCIENCE: {
        plausible: [
            'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 'Helium', 'Iron',
            'Gold', 'Silver', 'Mercury', 'Carbon', 'Photosynthesis', 'Mitosis',
            'Evolution', 'Gravity', 'Magnetism', 'Albert Einstein', 'Isaac Newton',
            'Mars', 'Venus', 'Jupiter', 'the brain', 'the heart'
        ],
        humorous: [
            'Magic', 'The Force', 'Unicorn tears', 'Dragon breath',
            'That thing from Star Trek', 'YouTube physics', 'Essential oils',
            'Whatever my horoscope says', 'Crystals and positive energy'
        ]
    },
    MOVIES: {
        plausible: [
            'Star Wars', 'Avatar', 'Titanic', 'The Godfather', 'Jurassic Park',
            'The Lion King', 'Toy Story', 'Batman', 'Spider-Man', 'Tom Hanks',
            'Leonardo DiCaprio', 'Brad Pitt', 'Steven Spielberg', 'Christopher Nolan'
        ],
        humorous: [
            'That movie with that guy', 'Nicolas Cage (every answer is Nicolas Cage)',
            'Fast & Furious 47', 'The Netflix adaptation', 'The sequel nobody asked for'
        ]
    },
    GEOGRAPHY: {
        plausible: [
            'United States', 'China', 'Russia', 'India', 'Brazil', 'Canada',
            'France', 'Germany', 'Japan', 'Australia', 'Paris', 'London', 'Tokyo',
            'Pacific Ocean', 'Atlantic Ocean', 'Mount Everest', 'Amazon River'
        ],
        humorous: [
            'Middle Earth', 'Narnia', 'Atlantis', 'Your mom\'s house',
            'Somewhere over the rainbow', 'Platform 9¾', 'Westeros',
            'Where Carmen Sandiego is', 'The place I can never pronounce correctly'
        ]
    },
    HISTORY: {
        plausible: [
            'George Washington', 'Abraham Lincoln', 'Napoleon', 'Julius Caesar',
            'Alexander the Great', 'World War I', 'World War II', 'The Civil War',
            'The Renaissance', 'Industrial Revolution', '1776', '1492', '1945'
        ],
        humorous: [
            'Last Tuesday', 'The day before yesterday', 'When the Fire Nation attacked',
            'The great meme war of 2016', 'Before Netflix existed', 'Ancient aliens did it'
        ]
    },
    'POP CULTURE': {
        plausible: [
            'TikTok', 'Instagram', 'Twitter/X', 'YouTube', 'Facebook',
            'Taylor Swift', 'Beyoncé', 'Drake', 'Netflix', 'Marvel', 'The Office',
            'Game of Thrones', 'Breaking Bad', 'Fortnite', 'Minecraft'
        ],
        humorous: [
            'Whatever the kids are into these days', 'The app I\'m too old to understand',
            'That dance everyone\'s doing', 'OK Boomer', 'Something something crypto',
            'That thing that was cool 5 minutes ago', 'Kardashian something'
        ]
    }
};

// Generic answers for unknown categories
const GENERIC_ANSWERS = {
    plausible: [
        '42', 'The answer', 'Yes', 'No', 'Maybe', 'All of the above',
        'None of the above', 'Both A and B', 'It depends', 'Unknown'
    ],
    humorous: [
        'Your guess is as good as mine', 'Ask Google', '¯\\_(ツ)_/¯',
        'The friends we made along the way', 'Error 404: Answer not found'
    ]
};

/**
 * Extract clean answer from Jeopardy-style format
 */
function extractCleanAnswer(answer) {
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

    // Capitalize first letter
    return cleanAnswer.charAt(0).toUpperCase() + cleanAnswer.slice(1);
}

/**
 * Generate choices for a clue
 */
function generateChoices(clue, categoryName) {
    const cleanAnswer = extractCleanAnswer(clue.answer);
    const categoryAnswers = WRONG_ANSWERS[categoryName] || GENERIC_ANSWERS;

    // Get wrong answers
    const wrongAnswers = [];

    // Get 2 plausible answers
    const plausiblePool = [...categoryAnswers.plausible].filter(
        a => a.toLowerCase() !== cleanAnswer.toLowerCase()
    );

    for (let i = 0; i < 2 && plausiblePool.length > 0; i++) {
        const idx = Math.floor(Math.random() * plausiblePool.length);
        wrongAnswers.push(plausiblePool[idx]);
        plausiblePool.splice(idx, 1);
    }

    // Add 1 humorous answer
    if (categoryAnswers.humorous && categoryAnswers.humorous.length > 0) {
        const idx = Math.floor(Math.random() * categoryAnswers.humorous.length);
        wrongAnswers.push(categoryAnswers.humorous[idx]);
    } else {
        // Add another plausible if no humor available
        if (plausiblePool.length > 0) {
            const idx = Math.floor(Math.random() * plausiblePool.length);
            wrongAnswers.push(plausiblePool[idx]);
        }
    }

    // Ensure we have exactly 3 wrong answers
    while (wrongAnswers.length < 3) {
        wrongAnswers.push('Another option');
    }

    // Create choices array with correct answer
    const allChoices = [cleanAnswer, ...wrongAnswers.slice(0, 3)];

    // Shuffle the choices
    for (let i = allChoices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allChoices[i], allChoices[j]] = [allChoices[j], allChoices[i]];
    }

    // Find correct answer index
    const correctChoice = allChoices.indexOf(cleanAnswer);

    return {
        choices: allChoices,
        correctChoice: correctChoice
    };
}

/**
 * Process a trivia pack file
 */
function processPackFile(filePath) {
    console.log(`\n📚 Processing trivia pack: ${filePath}`);

    // Read the file
    let pack;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        pack = JSON.parse(content);
    } catch (error) {
        console.error(`❌ Error reading file: ${error.message}`);
        return;
    }

    let questionsUpdated = 0;
    let questionsSkipped = 0;

    // Process each category
    pack.categories = pack.categories.map(category => {
        console.log(`\n📂 Processing category: ${category.name}`);

        category.clues = category.clues.map(clue => {
            // Skip if already has choices
            if (clue.choices && clue.correctChoice !== undefined) {
                questionsSkipped++;
                return clue;
            }

            // Generate choices
            const { choices, correctChoice } = generateChoices(clue, category.name);
            questionsUpdated++;

            console.log(`  ✅ Added choices for: "${clue.clue.substring(0, 50)}..."`);

            return {
                ...clue,
                choices,
                correctChoice
            };
        });

        return category;
    });

    // Process final round if exists
    if (pack.finalRound && !pack.finalRound.choices) {
        const { choices, correctChoice } = generateChoices(pack.finalRound, 'FINAL');
        pack.finalRound = {
            ...pack.finalRound,
            choices,
            correctChoice
        };
        questionsUpdated++;
        console.log(`\n✅ Added choices for final round`);
    }

    // Save the updated pack
    try {
        fs.writeFileSync(filePath, JSON.stringify(pack, null, 2));
        console.log(`\n🎉 Success! Updated ${questionsUpdated} questions, skipped ${questionsSkipped} (already had choices)`);
        console.log(`💾 Saved to: ${filePath}`);
    } catch (error) {
        console.error(`❌ Error saving file: ${error.message}`);
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const packFile = args[0] || DEFAULT_PACK_FILE;

    console.log('🎮 Buzzchain Trivia - Multiple Choice Generator');
    console.log('================================================');

    const fullPath = path.resolve(packFile);

    if (!fs.existsSync(fullPath)) {
        console.error(`\n❌ File not found: ${fullPath}`);
        console.log('\nUsage: node add-choices-to-questions.js [packFile]');
        console.log('Example: node add-choices-to-questions.js assets/packs/my_custom_pack.json');
        process.exit(1);
    }

    processPackFile(fullPath);

    console.log('\n✨ Done! Your questions now have multiple choice options.');
    console.log('   Each question has:');
    console.log('   • 1 correct answer');
    console.log('   • 2 plausible wrong answers');
    console.log('   • 1 humorous wrong answer');
}

// Run the script
main();