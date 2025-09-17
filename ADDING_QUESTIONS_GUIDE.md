# 📚 Adding New Questions to Buzzchain

This guide explains how to add new trivia questions to your Buzzchain game and ensure they automatically get proper multiple choice options.

## Quick Start

### Method 1: Automatic Choice Generation (Recommended)

1. **Add your questions** to `assets/packs/trivia_pack.json` with just the basic format:
```json
{
  "value": 200,
  "clue": "This planet is known as the Red Planet.",
  "answer": "What is Mars?"
}
```

2. **Run the choice generator**:
```bash
npm run add-choices
```

This will automatically add:
- 4 multiple choice options (A, B, C, D)
- 1 correct answer
- 2 plausible wrong answers
- 1 humorous wrong answer

### Method 2: Manual with Specific Choices

If you want to specify exact choices, add them manually:
```json
{
  "value": 200,
  "clue": "This planet is known as the Red Planet.",
  "answer": "What is Mars?",
  "choices": [
    "Venus",
    "Mars",
    "Jupiter",
    "Planet of the Apes"
  ],
  "correctChoice": 1
}
```

## Adding Questions to Different Categories

The automatic generator knows about these categories and will create relevant wrong answers:

### SPORTS
- Plausible: Other sports, athletes, teams, tournaments
- Humorous: Extreme ironing, competitive napping, etc.

### SCIENCE
- Plausible: Elements, scientists, body parts, planets
- Humorous: Magic, The Force, essential oils, etc.

### MOVIES
- Plausible: Other movies, actors, directors
- Humorous: "That movie with that guy", Nicolas Cage jokes, etc.

### GEOGRAPHY
- Plausible: Countries, cities, landmarks, oceans
- Humorous: Middle Earth, Narnia, "Your mom's house", etc.

### HISTORY
- Plausible: Historical figures, wars, dates, empires
- Humorous: "Last Tuesday", "Before WiFi existed", etc.

### POP CULTURE
- Plausible: Social media, celebrities, shows, games
- Humorous: "OK Boomer", "That thing kids are into", etc.

## Step-by-Step Example

### 1. Open `assets/packs/trivia_pack.json`

### 2. Find the category you want to add to:
```json
{
  "name": "SCIENCE",
  "clues": [
    // existing clues...
  ]
}
```

### 3. Add your new question(s):
```json
{
  "value": 300,
  "clue": "This is the chemical symbol for gold.",
  "answer": "What is Au?"
}
```

### 4. Run the generator:
```bash
npm run add-choices
```

### 5. Your question now has choices!
```json
{
  "value": 300,
  "clue": "This is the chemical symbol for gold.",
  "answer": "What is Au?",
  "choices": [
    "Fe",
    "Au",
    "Ag",
    "Sparkly yellow stuff"
  ],
  "correctChoice": 1
}
```

## Tips for Writing Good Questions

### ✅ DO:
- Write clear, unambiguous clues
- Use the Jeopardy format: "What is...", "Who is...", etc.
- Keep clues concise but informative
- Make sure there's only ONE correct answer
- Test difficulty - $100 should be easier than $500

### ❌ DON'T:
- Make clues too vague
- Use trick questions
- Include opinion-based answers
- Make $100 questions too hard

## Custom Categories

To add a new category, add it to the pack:
```json
{
  "name": "YOUR CATEGORY",
  "clues": [
    // your questions
  ]
}
```

The generator will use generic wrong answers for unknown categories, but you can update `add-choices-to-questions.js` to add category-specific wrong answer pools.

## Processing Multiple Packs

If you have custom trivia packs:
```bash
node add-choices-to-questions.js assets/packs/my_custom_pack.json
```

## Troubleshooting

### Choices not appearing in game?
1. Make sure you ran `npm run build` after adding questions
2. Check that the JSON is valid (no trailing commas, proper quotes)
3. Verify choices array has exactly 4 items
4. Check correctChoice is 0, 1, 2, or 3

### Want different humor style?
Edit `add-choices-to-questions.js` and modify the `humorous` arrays for each category.

### Need more plausible answers?
Add more options to the `plausible` arrays in `add-choices-to-questions.js`.

## Advanced: Programmatic Generation

You can also use the TypeScript class:
```typescript
import { ChoiceGenerator } from './src/util/ChoiceGenerator';

const clue = {
  value: 200,
  clue: "This is the largest planet.",
  answer: "What is Jupiter?"
};

const result = ChoiceGenerator.generateChoices(
  clue,
  'SCIENCE',
  { includeHumor: true, shuffleChoices: true }
);

// Result: { choices: [...], correctChoice: 2 }
```

## Need Help?

- The generator automatically handles Jeopardy-style answers
- It randomizes choice positions
- It ensures no duplicate answers
- It falls back to generic answers if needed

Happy question writing! 🎮🐝