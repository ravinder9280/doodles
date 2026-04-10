// Word bank for the drawing game
export const WORD_BANK: string[] = [
    // Animals
    'cat', 'dog', 'bird', 'fish', 'elephant', 'lion', 'tiger', 'bear', 'rabbit', 'mouse',
    'horse', 'cow', 'pig', 'sheep', 'chicken', 'duck', 'goose', 'owl', 'eagle', 'shark',
    'whale', 'dolphin', 'octopus', 'crab', 'lobster', 'butterfly', 'bee', 'spider', 'ant',

    // Objects
    'car', 'bicycle', 'airplane', 'train', 'boat', 'ship', 'truck', 'bus', 'motorcycle',
    'house', 'building', 'bridge', 'tower', 'castle', 'tree', 'flower', 'sun', 'moon',
    'star', 'cloud', 'rainbow', 'mountain', 'river', 'ocean', 'beach', 'island',

    // Food
    'apple', 'banana', 'orange', 'grape', 'strawberry', 'pizza', 'burger', 'cake', 'cookie',
    'ice cream', 'sandwich', 'bread', 'cheese', 'milk', 'coffee', 'tea', 'water',

    // Body parts
    'eye', 'nose', 'mouth', 'ear', 'hand', 'foot', 'head', 'arm', 'leg', 'finger',

    // Sports
    'football', 'basketball', 'soccer', 'tennis', 'baseball', 'golf', 'swimming', 'running',

    // Music
    'guitar', 'piano', 'drums', 'violin', 'trumpet', 'flute', 'singer', 'microphone',

    // Technology
    'computer', 'phone', 'tablet', 'camera', 'television', 'radio', 'keyboard', 'mouse',

    // Clothing
    'shirt', 'pants', 'shoes', 'hat', 'jacket', 'dress', 'socks', 'gloves',

    // Nature
    'forest', 'desert', 'jungle', 'snow', 'ice', 'fire', 'wind', 'storm', 'thunder',

    // Activities
    'reading', 'writing', 'drawing', 'singing', 'dancing', 'jumping', 'running', 'walking',
    'sleeping', 'eating', 'drinking', 'cooking', 'cleaning', 'shopping',

    // Emotions
    'happy', 'sad', 'angry', 'surprised', 'excited', 'scared', 'tired', 'sleepy',

    // Colors
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white',

    // Shapes
    'circle', 'square', 'triangle', 'rectangle', 'oval', 'star', 'heart', 'diamond',

    // Weather
    'sunny', 'rainy', 'cloudy', 'windy', 'snowy', 'stormy', 'foggy',

    // Time
    'clock', 'watch', 'calendar', 'hourglass', 'sunrise', 'sunset', 'midnight', 'noon',

    // Fantasy
    'dragon', 'unicorn', 'wizard', 'witch', 'fairy', 'ghost', 'monster', 'robot', 'alien',

    // Common items
    'book', 'pen', 'pencil', 'paper', 'bag', 'box', 'ball', 'toy', 'doll', 'game',
    'key', 'lock', 'door', 'window', 'chair', 'table', 'bed', 'lamp', 'mirror',

    // Professions
    'doctor', 'teacher', 'chef', 'artist', 'musician', 'athlete', 'pilot', 'sailor',
    'farmer', 'builder', 'police', 'firefighter', 'nurse', 'scientist',

    // Places
    'school', 'hospital', 'restaurant', 'store', 'park', 'zoo', 'museum', 'library',
    'theater', 'cinema', 'beach', 'mountain', 'city', 'village', 'country',

    // Actions
    'jump', 'run', 'walk', 'fly', 'swim', 'climb', 'fall', 'sit', 'stand', 'lie',
    'throw', 'catch', 'kick', 'hit', 'push', 'pull', 'lift', 'carry', 'drop',

    // Abstract
    'love', 'happiness', 'friendship', 'adventure', 'journey', 'dream', 'hope', 'courage',
    'wisdom', 'strength', 'peace', 'freedom', 'success', 'victory', 'celebration'
]

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]
        shuffled[i] = shuffled[j]!
        shuffled[j] = temp!
    }
    return shuffled
}

/**
 * Get a random word from the word bank
 */
export function getRandomWord(): string|undefined {
    return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
}

/**
 * Get multiple random words (shuffled)
 */
export function getRandomWords(count: number): string[] {
    const shuffled = shuffleArray(WORD_BANK)
    return shuffled.slice(0, Math.min(count, WORD_BANK.length))
}
