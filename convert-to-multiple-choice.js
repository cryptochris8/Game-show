const fs = require('fs');
const path = require('path');

// Path to the trivia pack file
const TRIVIA_PACK_PATH = path.join(__dirname, 'assets', 'packs', 'trivia_pack.json');

/**
 * Extracts the clean answer from Jeopardy-style answers
 */
function extractCleanAnswer(answer) {
  // Remove "What is " or "Who is " and trailing "?"
  return answer
    .replace(/^(What is |Who is |What are |Who are )/i, '')
    .replace(/\?$/, '')
    .trim();
}

/**
 * Generates wrong answers based on the category and correct answer
 */
function generateWrongAnswers(category, correctAnswer, clue) {
  const categoryName = category.toLowerCase();

  switch (categoryName) {
    case 'sports':
      return generateSportsWrongAnswers(correctAnswer, clue);
    case 'science':
      return generateScienceWrongAnswers(correctAnswer, clue);
    case 'movies':
      return generateMoviesWrongAnswers(correctAnswer, clue);
    case 'geography':
      return generateGeographyWrongAnswers(correctAnswer, clue);
    case 'history':
      return generateHistoryWrongAnswers(correctAnswer, clue);
    case 'pop culture':
      return generatePopCultureWrongAnswers(correctAnswer, clue);
    default:
      return generateGenericWrongAnswers(correctAnswer, clue);
  }
}

function generateSportsWrongAnswers(correctAnswer, clue) {
  const sportOptions = {
    sports: ['Football', 'Basketball', 'Soccer', 'Tennis', 'Golf', 'Baseball', 'Hockey', 'Swimming', 'Track and Field', 'Boxing'],
    athletes: ['Michael Jordan', 'Tom Brady', 'Serena Williams', 'Tiger Woods', 'Babe Ruth', 'Wayne Gretzky', 'Muhammad Ali', 'LeBron James'],
    terms: ['Touchdown', 'Home run', 'Goal', 'Ace', 'Strike', 'Slam dunk', 'Hat trick', 'Knockout'],
    teams: ['Lakers', 'Yankees', 'Cowboys', 'Celtics', 'Patriots', 'Warriors', 'Dodgers', 'Bulls'],
    numbers: ['6', '10', '15', '21', '30', '50', '100'],
    tournaments: ['Super Bowl', 'World Series', 'NBA Finals', 'Stanley Cup', 'Masters', 'Wimbledon', 'Olympics']
  };

  // Determine what type of answer this is
  if (/\d+/.test(correctAnswer)) {
    return getRandomItems(sportOptions.numbers.filter(n => n !== correctAnswer), 3);
  } else if (sportOptions.athletes.some(athlete => athlete.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(sportOptions.athletes.filter(a => a.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (sportOptions.teams.some(team => team.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(sportOptions.teams.filter(t => t.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (sportOptions.tournaments.some(tournament => tournament.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(sportOptions.tournaments.filter(t => t.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    // Mix of sports terms and sports
    const allOptions = [...sportOptions.sports, ...sportOptions.terms];
    return getRandomItems(allOptions.filter(o => o.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generateScienceWrongAnswers(correctAnswer, clue) {
  const scienceOptions = {
    elements: ['Hydrogen', 'Oxygen', 'Carbon', 'Gold', 'Silver', 'Iron', 'Copper', 'Nitrogen', 'Helium'],
    planets: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    scientists: ['Einstein', 'Newton', 'Darwin', 'Curie', 'Tesla', 'Galileo', 'Hawking', 'Fleming'],
    bodyParts: ['Heart', 'Brain', 'Liver', 'Lungs', 'Kidneys', 'Stomach', 'Skin', 'Pancreas'],
    terms: ['Photosynthesis', 'Evolution', 'Gravity', 'Magnetism', 'Radiation', 'Molecule', 'Electron', 'Proton'],
    fields: ['Biology', 'Chemistry', 'Physics', 'Geology', 'Astronomy', 'Genetics', 'Botany']
  };

  if (scienceOptions.elements.some(el => el.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(scienceOptions.elements.filter(e => e.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (scienceOptions.planets.some(planet => planet.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(scienceOptions.planets.filter(p => p.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (scienceOptions.scientists.some(scientist => scientist.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(scienceOptions.scientists.filter(s => s.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (scienceOptions.bodyParts.some(part => part.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(scienceOptions.bodyParts.filter(p => p.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    const allOptions = [...scienceOptions.terms, ...scienceOptions.fields];
    return getRandomItems(allOptions.filter(o => o.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generateMoviesWrongAnswers(correctAnswer, clue) {
  const movieOptions = {
    movies: ['Titanic', 'Avatar', 'Star Wars', 'The Lion King', 'Jaws', 'E.T.', 'Jurassic Park', 'Batman', 'Superman', 'Spider-Man'],
    actors: ['Tom Hanks', 'Leonardo DiCaprio', 'Robert Downey Jr.', 'Will Smith', 'Brad Pitt', 'Johnny Depp', 'Denzel Washington'],
    actresses: ['Meryl Streep', 'Jennifer Lawrence', 'Scarlett Johansson', 'Emma Stone', 'Angelina Jolie', 'Emma Watson'],
    directors: ['Steven Spielberg', 'Christopher Nolan', 'Martin Scorsese', 'Quentin Tarantino', 'James Cameron'],
    characters: ['Batman', 'Superman', 'Iron Man', 'Harry Potter', 'Luke Skywalker', 'Indiana Jones']
  };

  if (movieOptions.actors.some(actor => actor.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(movieOptions.actors.filter(a => a.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (movieOptions.actresses.some(actress => actress.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(movieOptions.actresses.filter(a => a.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (movieOptions.directors.some(director => director.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(movieOptions.directors.filter(d => d.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (movieOptions.characters.some(char => char.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(movieOptions.characters.filter(c => c.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    return getRandomItems(movieOptions.movies.filter(m => m.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generateGeographyWrongAnswers(correctAnswer, clue) {
  const geoOptions = {
    countries: ['United States', 'Canada', 'Mexico', 'Brazil', 'France', 'Germany', 'Italy', 'Spain', 'China', 'Japan', 'India', 'Russia', 'Australia'],
    capitals: ['Paris', 'London', 'Berlin', 'Rome', 'Madrid', 'Tokyo', 'Beijing', 'Moscow', 'Canberra', 'Ottawa'],
    oceans: ['Pacific', 'Atlantic', 'Indian', 'Arctic', 'Southern'],
    continents: ['Asia', 'Africa', 'North America', 'South America', 'Europe', 'Australia', 'Antarctica'],
    rivers: ['Nile', 'Amazon', 'Mississippi', 'Thames', 'Seine', 'Danube'],
    mountains: ['Everest', 'K2', 'Kilimanjaro', 'Denali', 'Mont Blanc'],
    states: ['California', 'Texas', 'Florida', 'New York', 'Hawaii', 'Alaska']
  };

  if (geoOptions.countries.some(country => country.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(geoOptions.countries.filter(c => c.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (geoOptions.capitals.some(capital => capital.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(geoOptions.capitals.filter(c => c.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (geoOptions.oceans.some(ocean => ocean.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(geoOptions.oceans.filter(o => o.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (geoOptions.continents.some(continent => continent.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(geoOptions.continents.filter(c => c.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (geoOptions.states.some(state => state.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(geoOptions.states.filter(s => s.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    const allOptions = [...geoOptions.rivers, ...geoOptions.mountains];
    return getRandomItems(allOptions.filter(o => o.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generateHistoryWrongAnswers(correctAnswer, clue) {
  const historyOptions = {
    presidents: ['George Washington', 'Thomas Jefferson', 'Abraham Lincoln', 'Theodore Roosevelt', 'Franklin D. Roosevelt', 'John F. Kennedy'],
    wars: ['World War I', 'World War II', 'Civil War', 'Revolutionary War', 'Vietnam War', 'Korean War'],
    people: ['Napoleon', 'Hitler', 'Churchill', 'Caesar', 'Cleopatra', 'Alexander the Great'],
    documents: ['Constitution', 'Declaration of Independence', 'Magna Carta', 'Treaty of Versailles'],
    empires: ['Roman Empire', 'British Empire', 'Ottoman Empire', 'Mongol Empire'],
    events: ['French Revolution', 'Industrial Revolution', 'Renaissance', 'Reformation']
  };

  if (historyOptions.presidents.some(pres => pres.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(historyOptions.presidents.filter(p => p.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (historyOptions.wars.some(war => war.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(historyOptions.wars.filter(w => w.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (historyOptions.documents.some(doc => doc.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(historyOptions.documents.filter(d => d.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    const allOptions = [...historyOptions.people, ...historyOptions.empires, ...historyOptions.events];
    return getRandomItems(allOptions.filter(o => o.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generatePopCultureWrongAnswers(correctAnswer, clue) {
  const popOptions = {
    platforms: ['TikTok', 'Instagram', 'Twitter', 'Facebook', 'YouTube', 'Snapchat', 'Netflix', 'Spotify'],
    singers: ['Taylor Swift', 'Beyoncé', 'Drake', 'Adele', 'Ed Sheeran', 'Ariana Grande', 'Justin Bieber'],
    shows: ['Game of Thrones', 'Breaking Bad', 'The Office', 'Friends', 'Stranger Things', 'The Crown'],
    games: ['Minecraft', 'Fortnite', 'Among Us', 'Call of Duty', 'FIFA', 'Pokémon'],
    celebrities: ['Elon Musk', 'Kim Kardashian', 'The Rock', 'Oprah Winfrey', 'Ellen DeGeneres']
  };

  if (popOptions.platforms.some(platform => platform.toLowerCase() === correctAnswer.toLowerCase())) {
    return getRandomItems(popOptions.platforms.filter(p => p.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (popOptions.singers.some(singer => singer.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(popOptions.singers.filter(s => s.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (popOptions.shows.some(show => show.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(popOptions.shows.filter(s => s.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else if (popOptions.games.some(game => game.toLowerCase().includes(correctAnswer.toLowerCase()))) {
    return getRandomItems(popOptions.games.filter(g => g.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  } else {
    return getRandomItems(popOptions.celebrities.filter(c => c.toLowerCase() !== correctAnswer.toLowerCase()), 3);
  }
}

function generateGenericWrongAnswers(correctAnswer, clue) {
  // Fallback generic options
  const genericOptions = [
    'Option A', 'Option B', 'Option C', 'Choice 1', 'Choice 2', 'Choice 3',
    'Alternative 1', 'Alternative 2', 'Alternative 3', 'Answer A', 'Answer B', 'Answer C'
  ];

  return getRandomItems(genericOptions, 3);
}

/**
 * Gets random items from an array
 */
function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Generates 4 multiple choice options with the correct answer randomly placed
 */
function generateMultipleChoiceOptions(category, clue, answer) {
  const cleanAnswer = extractCleanAnswer(answer);
  const wrongAnswers = generateWrongAnswers(category, cleanAnswer, clue);

  // Ensure we have exactly 3 wrong answers
  while (wrongAnswers.length < 3) {
    wrongAnswers.push(`Option ${wrongAnswers.length + 1}`);
  }

  // Create all 4 choices
  const allChoices = [cleanAnswer, ...wrongAnswers.slice(0, 3)];

  // Shuffle the choices and find where the correct answer ended up
  const shuffledChoices = [...allChoices].sort(() => 0.5 - Math.random());
  const correctChoiceIndex = shuffledChoices.findIndex(choice => choice === cleanAnswer);

  return {
    choices: shuffledChoices,
    correctChoice: correctChoiceIndex
  };
}

/**
 * Processes the trivia pack and adds multiple choice options where missing
 */
function processTriviaPack() {
  try {
    // Read the existing trivia pack
    console.log('Reading trivia pack...');
    const triviaData = JSON.parse(fs.readFileSync(TRIVIA_PACK_PATH, 'utf8'));

    let totalClues = 0;
    let processedClues = 0;

    // Process each category
    triviaData.categories.forEach((category, categoryIndex) => {
      console.log(`\nProcessing category: ${category.name}`);

      category.clues.forEach((clue, clueIndex) => {
        totalClues++;

        // Check if this clue already has multiple choice options
        if (!clue.hasOwnProperty('choices') || !clue.hasOwnProperty('correctChoice')) {
          console.log(`  Generating choices for clue ${clueIndex + 1}: "${clue.clue.substring(0, 50)}..."`);

          const mcOptions = generateMultipleChoiceOptions(category.name, clue.clue, clue.answer);
          clue.choices = mcOptions.choices;
          clue.correctChoice = mcOptions.correctChoice;

          processedClues++;
        } else {
          console.log(`  Skipping clue ${clueIndex + 1} (already has choices)`);
        }
      });
    });

    // Process the final round if it doesn't have choices
    if (triviaData.finalRound && (!triviaData.finalRound.hasOwnProperty('choices') || !triviaData.finalRound.hasOwnProperty('correctChoice'))) {
      console.log('\nProcessing Final Round...');
      const mcOptions = generateMultipleChoiceOptions(triviaData.finalRound.category, triviaData.finalRound.clue, triviaData.finalRound.answer);
      triviaData.finalRound.choices = mcOptions.choices;
      triviaData.finalRound.correctChoice = mcOptions.correctChoice;
      processedClues++;
    }

    // Write the updated trivia pack back to file
    console.log('\nWriting updated trivia pack...');
    fs.writeFileSync(TRIVIA_PACK_PATH, JSON.stringify(triviaData, null, 2), 'utf8');

    console.log(`\n✅ Conversion complete!`);
    console.log(`📊 Total clues: ${totalClues + 1} (including final round)`);
    console.log(`🔄 Processed clues: ${processedClues}`);
    console.log(`✨ Skipped clues: ${totalClues + 1 - processedClues} (already had choices)`);
    console.log(`💾 Updated file saved to: ${TRIVIA_PACK_PATH}`);

  } catch (error) {
    console.error('❌ Error processing trivia pack:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  console.log('🎯 Starting Multiple Choice Generator...');
  console.log('📁 Target file:', TRIVIA_PACK_PATH);
  processTriviaPack();
}

module.exports = {
  generateMultipleChoiceOptions,
  extractCleanAnswer,
  generateWrongAnswers
};