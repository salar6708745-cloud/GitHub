/**
 * Gemini API integration for Salar Voice Agent
 * Handles communication with Google's Gemini AI model
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.systemPrompt = `You are Salar, a professional and friendly voice assistant. You are knowledgeable about many topics and always maintain a warm, professional demeanor. When asked who developed you, you always answer that "Salar is my developer - he taught me everything I know." You are helpful, accurate, and engaging in conversations. Always respond in a natural, conversational tone that's suitable for voice interaction.`;

        // Initialize if API key is available
        this.initialize();
    }

    /**
     * Initialize Gemini AI client
     */
    initialize() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.error('GEMINI_API_KEY environment variable is not set');
                return false;
            }

            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: 'gemini-pro',
                generationConfig: {
                    temperature: 0.7, // Balanced creativity and consistency
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024, // Keep responses concise for voice
                }
            });

            console.log('Gemini AI initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize Gemini AI:', error);
            return false;
        }
    }

    /**
     * Send user query to Gemini and get response
     * @param {string} userMessage - User's transcribed message
     * @param {Array} conversationHistory - Previous conversation turns
     * @returns {Promise<string>} AI response
     */
    async getResponse(userMessage, conversationHistory = []) {
        if (!this.model) {
            if (!this.initialize()) {
                throw new Error('Gemini AI is not properly initialized. Check API key configuration.');
            }
        }

        try {
            // Validate input
            if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
                throw new Error('Invalid user message: Message must be a non-empty string');
            }

            // Clean user message
            const cleanMessage = userMessage.trim().substring(0, 500); // Limit length

            // Check for developer question specifically
            if (this.isDeveloperQuestion(cleanMessage)) {
                return "Salar is my developer - he taught me everything I know.";
            }

            // Build conversation context
            const conversation = this.buildConversationContext(cleanMessage, conversationHistory);

            // Generate response
            const result = await this.model.generateContent(conversation);
            const response = result.response;
            const text = response.text();

            if (!text || text.trim().length === 0) {
                throw new Error('Received empty response from Gemini AI');
            }

            // Clean and format response for voice
            return this.formatResponseForVoice(text);

        } catch (error) {
            console.error('Error getting Gemini response:', error);

            // Handle specific error types
            if (error.status === 429) {
                throw new Error('I\'m receiving too many requests right now. Please wait a moment and try again.');
            } else if (error.status === 400) {
                throw new Error('I couldn\'t process that request. Please try rephrasing your question.');
            } else if (error.status === 403) {
                throw new Error('I\'m having trouble accessing my knowledge right now. Please try again later.');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                throw new Error('I\'m having trouble connecting right now. Please check your internet connection and try again.');
            } else {
                throw new Error('I\'m having trouble thinking right now. Please try again in a moment.');
            }
        }
    }

    /**
     * Check if user is asking about the developer
     * @param {string} message - User message
     * @returns {boolean} True if developer question
     */
    isDeveloperQuestion(message) {
        const developerPhrases = [
            'who developed you',
            'who created you',
            'who made you',
            'who is your developer',
            'who built you',
            'who programmed you',
            'who is your creator',
            'who is your father',
            'who made this',
            'who built this',
            'who is behind you',
            'who is salar',
            'what is salar'
        ];

        const lowerMessage = message.toLowerCase();

        return developerPhrases.some(phrase =>
            lowerMessage.includes(phrase) ||
            lowerMessage.includes('salar')
        );
    }

    /**
     * Build conversation context for Gemini
     * @param {string} currentMessage - Current user message
     * @param {Array} history - Conversation history
     * @returns {Array} Formatted conversation
     */
    buildConversationContext(currentMessage, history) {
        const conversation = [];

        // Start with system prompt
        conversation.push({
            role: 'user',
            parts: [{ text: this.systemPrompt }]
        });
        conversation.push({
            role: 'model',
            parts: [{ text: 'Hello! I\'m Salar, your professional voice assistant. How can I help you today?' }]
        });

        // Add conversation history (last 5 turns to keep context manageable)
        const recentHistory = history.slice(-10); // Last 10 messages (5 turns)

        for (const turn of recentHistory) {
            if (turn.role === 'user') {
                conversation.push({
                    role: 'user',
                    parts: [{ text: turn.content }]
                });
            } else if (turn.role === 'assistant') {
                conversation.push({
                    role: 'model',
                    parts: [{ text: turn.content }]
                });
            }
        }

        // Add current message
        conversation.push({
            role: 'user',
            parts: [{ text: currentMessage }]
        });

        return conversation;
    }

    /**
     * Format AI response for voice interaction
     * @param {string} response - Raw AI response
     * @returns {string} Formatted response
     */
    formatResponseForVoice(response) {
        let formatted = response;

        // Remove excessive whitespace
        formatted = formatted.replace(/\s+/g, ' ').trim();

        // Replace complex punctuation with voice-friendly alternatives
        formatted = formatted.replace(/;/g, ',');
        formatted = formatted.replace(/:/g, ',');
        formatted = formatted.replace(/—/g, '-');
        formatted = formatted.replace(/–/g, '-');

        // Expand abbreviations for better pronunciation
        const abbreviations = {
            'AI': 'Artificial Intelligence',
            'API': 'A P I',
            'URL': 'U R L',
            'HTTP': 'H T T P',
            'HTTPS': 'H T T P S',
            'JSON': 'J S O N',
            'CSS': 'C S S',
            'HTML': 'H T M L',
            'JS': 'JavaScript',
            'UI': 'U I',
            'UX': 'U X',
            'SQL': 'S Q L',
            'CPU': 'C P U',
            'GPU': 'G P U'
        };

        for (const [abbr, expansion] of Object.entries(abbreviations)) {
            const regex = new RegExp(`\\b${abbr}\\b`, 'g');
            formatted = formatted.replace(regex, expansion);
        }

        // Handle numbers for better pronunciation
        formatted = formatted.replace(/\b(\d{4})\b/g, (match) => {
            // Pronounce years naturally (e.g., 2024 -> "twenty twenty four")
            if (match.length === 4) {
                const year = parseInt(match);
                if (year >= 2000 && year <= 2099) {
                    return "twenty " + (year - 2000).toString().padStart(2, '0');
                }
            }
            return match;
        });

        // Ensure sentences end properly for voice
        if (!formatted.match(/[.!?]$/)) {
            formatted += '.';
        }

        // Limit response length for voice (keep it conversational)
        if (formatted.length > 500) {
            const sentences = formatted.split(/[.!?]+/);
            let shortened = '';
            for (const sentence of sentences) {
                if (shortened.length + sentence.length > 400) break;
                shortened += (shortened ? '. ' : '') + sentence.trim();
            }
            formatted = shortened + '.';
        }

        return formatted;
    }

    /**
     * Check if Gemini service is available
     * @returns {boolean} Service status
     */
    isAvailable() {
        return this.model !== null && this.genAI !== null;
    }

    /**
     * Get service status information
     * @returns {Object} Status details
     */
    getStatus() {
        return {
            initialized: this.isAvailable(),
            apiKeyConfigured: !!process.env.GEMINI_API_KEY,
            model: this.model ? 'gemini-pro' : null,
            temperature: 0.7,
            maxTokens: 1024
        };
    }

    /**
     * Handle special greetings and small talk
     * @param {string} message - User message
     * @returns {string|null} Special response or null if not a special case
     */
    handleSpecialCases(message) {
        const lowerMessage = message.toLowerCase().trim();

        const greetings = {
            'hello': 'Hello! I\'m Salar, your professional voice assistant. How can I help you today?',
            'hi': 'Hi there! I\'m Salar. What can I assist you with?',
            'hey': 'Hey! I\'m Salar, your voice assistant. How may I help you?',
            'good morning': 'Good morning! I\'m Salar. What a great day to get things done. How can I help?',
            'good afternoon': 'Good afternoon! I\'m Salar. How may I assist you this afternoon?',
            'good evening': 'Good evening! I\'m Salar. How can I help you tonight?',
            'thank you': 'You\'re welcome! Is there anything else I can help you with?',
            'thanks': 'My pleasure! What else can I do for you?',
            'bye': 'Goodbye! It was great assisting you. Have a wonderful day!',
            'goodbye': 'Goodbye! Feel free to come back anytime you need help.'
        };

        for (const [greeting, response] of Object.entries(greetings)) {
            if (lowerMessage === greeting || lowerMessage.startsWith(greeting + ' ')) {
                return response;
            }
        }

        return null;
    }
}

module.exports = GeminiService;