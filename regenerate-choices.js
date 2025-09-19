/**
 * Script to regenerate all question choices using the improved ChoiceGenerator
 * This will fix inconsistent answer types and improve question quality
 */

const fs = require('fs');
const path = require('path');

// Simplified version of the improved choice generator
const ANSWER_POOLS = {
    HISTORICAL_FIGURES: [
        'George Washington', 'Abraham Lincoln', 'Napoleon Bonaparte', 'Julius Caesar',
        'Cleopatra', 'Alexander the Great', 'Winston Churchill', 'Adolf Hitler',
        'Franklin D. Roosevelt', 'Theodore Roosevelt', 'John F. Kennedy',
        'Martin Luther King Jr.', 'Nelson Mandela', 'Mahatma Gandhi'
    ],
    SCIENTISTS: [
        'Albert Einstein', 'Isaac Newton', 'Marie Curie', 'Charles Darwin',
        'Stephen Hawking', 'Galileo Galilei', 'Nikola Tesla', 'Thomas Edison',
        'Leonardo da Vinci', 'Benjamin Franklin', 'Aristotle', 'Archimedes'
    ],
    ATHLETES: [
        'Michael Jordan', 'LeBron James', 'Tom Brady', 'Serena Williams',
        'Tiger Woods', 'Muhammad Ali', 'Babe Ruth', 'Wayne Gretzky',
        'Lionel Messi', 'Roger Federer', 'Usain Bolt', 'Pelé'
    ],
    COUNTRIES: [
        'United States', 'China', 'Russia', 'France', 'Germany', 'Italy',
        'Spain', 'Japan', 'India', 'Brazil', 'Canada', 'Australia'
    ],
    CITIES: [
        'New York', 'London', 'Paris', 'Tokyo', 'Rome', 'Berlin',
        'Moscow', 'Beijing', 'Los Angeles', 'Chicago', 'Sydney', 'Madrid'
    ],
    LANDMARKS: [
        'the Eiffel Tower', 'the Great Wall of China', 'the Statue of Liberty',
        'the Colosseum', 'the Taj Mahal', 'Machu Picchu', 'the Pyramids of Giza',
        'Stonehenge', 'the Sydney Opera House', 'Big Ben'
    ],
    SPORTS_TERMS: [
        'Football', 'Basketball', 'Baseball', 'Soccer', 'Tennis', 'Golf', 'Hockey',
        'Cricket', 'Rugby', 'Boxing', 'Wrestling', 'Swimming', 'Volleyball'
    ],
    SCIENCE_TERMS: [
        'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 'Gravity',
        'Photosynthesis', 'Evolution', 'DNA', 'Atom', 'Molecule', 'Physics', 'Chemistry'
    ],
    HISTORICAL_EVENTS: [
        'World War I', 'World War II', 'the Civil War', 'the Revolutionary War',
        'the Cold War', 'the Great Depression', 'the Renaissance', 'the Industrial Revolution'
    ],
    BOOKS_MOVIES: [
        'Harry Potter', 'Lord of the Rings', 'Star Wars', 'The Godfather',
        'Titanic', 'Gone with the Wind', 'Casablanca', 'The Great Gatsby'
    ]
};

const HUMOROUS_ANSWERS = [
    'Magic', 'The Force', 'Unicorn tears', 'Dragon breath',
    'That thing from Star Trek', 'YouTube physics', 'Flat Earth theory',
    'Essential oils', 'Mercury in retrograde', 'Bad vibes',
    'The mitochondria (powerhouse of everything)', 'Science stuff',
    'Whatever my horoscope says', 'Crystals and positive energy'
];

function detectAnswerType(answer) {
    const cleanAnswer = answer.toLowerCase().replace(/^(what|who|where|when) (is|are|was|were) /, '').replace(/\?$/, '');

    // Check if it's a person
    for (const [poolName, pool] of Object.entries(ANSWER_POOLS)) {
        if (['HISTORICAL_FIGURES', 'SCIENTISTS', 'ATHLETES'].includes(poolName)) {
            if (pool.some(item => item.toLowerCase() === cleanAnswer)) {
                return poolName;
            }
        }
    }

    // Check if it's a place
    for (const [poolName, pool] of Object.entries(ANSWER_POOLS)) {
        if (['COUNTRIES', 'CITIES', 'LANDMARKS'].includes(poolName)) {
            if (pool.some(item => item.toLowerCase().includes(cleanAnswer) || cleanAnswer.includes(item.toLowerCase()))) {
                return poolName;
            }
        }
    }

    // Check if it's a concept/thing
    for (const [poolName, pool] of Object.entries(ANSWER_POOLS)) {
        if (['SPORTS_TERMS', 'SCIENCE_TERMS', 'HISTORICAL_EVENTS', 'BOOKS_MOVIES'].includes(poolName)) {
            if (pool.some(item => item.toLowerCase().includes(cleanAnswer) || cleanAnswer.includes(item.toLowerCase()))) {
                return poolName;
            }
        }
    }

    return null;
}

function generateBetterChoices(correctAnswer, category) {
    const cleanCorrectAnswer = correctAnswer.toLowerCase().replace(/^(what|who|where|when) (is|are|was|were) /, '').replace(/\?$/, '');
    const answerType = detectAnswerType(correctAnswer);

    let wrongAnswers = [];

    if (answerType && ANSWER_POOLS[answerType]) {
        // Get answers of the same type
        const sameTypeAnswers = ANSWER_POOLS[answerType].filter(item =>
            item.toLowerCase() !== cleanCorrectAnswer
        );

        // Add 2 plausible answers of the same type
        while (wrongAnswers.length < 2 && sameTypeAnswers.length > 0) {
            const randomIndex = Math.floor(Math.random() * sameTypeAnswers.length);
            wrongAnswers.push(sameTypeAnswers[randomIndex]);
            sameTypeAnswers.splice(randomIndex, 1);
        }
    }

    // Add 1 humorous answer
    if (wrongAnswers.length < 3) {
        const humorousAnswer = HUMOROUS_ANSWERS[Math.floor(Math.random() * HUMOROUS_ANSWERS.length)];
        wrongAnswers.push(humorousAnswer);
    }

    // Fill remaining slots with generic answers if needed
    while (wrongAnswers.length < 3) {
        wrongAnswers.push('Something else');
    }

    // Create choices array with correct answer
    const formattedCorrectAnswer = cleanCorrectAnswer.charAt(0).toUpperCase() + cleanCorrectAnswer.slice(1);
    const choices = [formattedCorrectAnswer, ...wrongAnswers.slice(0, 3)];

    // Shuffle choices
    const correctChoice = Math.floor(Math.random() * 4);
    const shuffledChoices = [...choices];
    [shuffledChoices[0], shuffledChoices[correctChoice]] = [shuffledChoices[correctChoice], shuffledChoices[0]];

    return {
        choices: shuffledChoices,
        correctChoice: correctChoice
    };
}

function regenerateChoices() {
    const triviaPackPath = path.join(__dirname, 'assets', 'packs', 'trivia_pack.json');

    if (!fs.existsSync(triviaPackPath)) {
        console.error('Trivia pack not found:', triviaPackPath);
        return;
    }

    console.log('Loading trivia pack...');
    const pack = JSON.parse(fs.readFileSync(triviaPackPath, 'utf8'));

    let questionsUpdated = 0;
    let questionsWithIssues = 0;

    // Process each category
    pack.categories.forEach(category => {
        console.log(`Processing category: ${category.name}`);

        category.clues.forEach(clue => {
            // Check if choices are inconsistent (mixing different answer types)
            const hasInconsistentChoices = checkInconsistentChoices(clue.choices);

            if (hasInconsistentChoices) {
                console.log(`  Fixing inconsistent choices for: "${clue.clue}"`);
                const newChoices = generateBetterChoices(clue.answer, category.name);
                clue.choices = newChoices.choices;
                clue.correctChoice = newChoices.correctChoice;
                questionsUpdated++;
            }

            questionsWithIssues += hasInconsistentChoices ? 1 : 0;
        });
    });

    // Save the updated pack
    console.log(`\nUpdated ${questionsUpdated} questions with inconsistent choices`);
    console.log(`Total questions with issues found: ${questionsWithIssues}`);

    // Create backup
    const backupPath = triviaPackPath.replace('.json', '.backup.json');
    fs.writeFileSync(backupPath, fs.readFileSync(triviaPackPath));
    console.log(`Backup saved to: ${backupPath}`);

    // Save updated pack
    fs.writeFileSync(triviaPackPath, JSON.stringify(pack, null, 2));
    console.log(`Updated trivia pack saved to: ${triviaPackPath}`);
}

function checkInconsistentChoices(choices) {
    if (!choices || choices.length !== 4) return false;

    let hasPersonNames = 0;
    let hasPlaces = 0;
    let hasThings = 0;

    choices.forEach(choice => {
        const lowerChoice = choice.toLowerCase();

        // Check if it's a person name (starts with capital, contains common name patterns)
        if (detectAnswerType(`What is ${choice}?`) === 'HISTORICAL_FIGURES' ||
            detectAnswerType(`What is ${choice}?`) === 'SCIENTISTS' ||
            detectAnswerType(`What is ${choice}?`) === 'ATHLETES') {
            hasPersonNames++;
        }
        // Check if it's a place
        else if (detectAnswerType(`What is ${choice}?`) === 'COUNTRIES' ||
                 detectAnswerType(`What is ${choice}?`) === 'CITIES' ||
                 detectAnswerType(`What is ${choice}?`) === 'LANDMARKS') {
            hasPlaces++;
        }
        // Check for obvious mixing (person names with non-names)
        else if (lowerChoice.includes('revolution') || lowerChoice.includes('empire') ||
                 lowerChoice.includes('war') || lowerChoice === 'magic' ||
                 lowerChoice.includes('force')) {
            hasThings++;
        }
    });

    // If we have a mix of different types, it's inconsistent
    const typesPresent = (hasPersonNames > 0 ? 1 : 0) + (hasPlaces > 0 ? 1 : 0) + (hasThings > 0 ? 1 : 0);
    return typesPresent > 1 && (hasPersonNames > 0 || hasPlaces > 0);
}

// Run the regeneration
regenerateChoices();