/**
 * Google Cloud Speech services for Salar Voice Agent
 * Handles speech-to-text and text-to-speech conversions
 */

const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');

class SpeechService {
    constructor() {
        this.speechClient = null;
        this.ttsClient = null;
        this.initialized = false;

        // Initialize if credentials are available
        this.initialize();
    }

    /**
     * Initialize Google Cloud Speech clients
     */
    initialize() {
        try {
            // Check for Google Cloud credentials
            const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            if (!credentialsPath || !fs.existsSync(credentialsPath)) {
                console.error('Google Cloud credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.');
                return false;
            }

            // Initialize speech-to-text client
            this.speechClient = new speech.SpeechClient();

            // Initialize text-to-speech client
            this.ttsClient = new textToSpeech.TextToSpeechClient();

            this.initialized = true;
            console.log('Google Cloud Speech services initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize Google Cloud Speech services:', error);
            return false;
        }
    }

    /**
     * Convert speech audio to text using Google Speech-to-Text
     * @param {Buffer} audioBuffer - Audio data buffer
     * @param {string} mimeType - Audio MIME type
     * @returns {Promise<string>} Transcribed text
     */
    async speechToText(audioBuffer, mimeType = 'audio/webm') {
        if (!this.initialized) {
            if (!this.initialize()) {
                throw new Error('Speech services are not properly initialized. Check Google Cloud credentials.');
            }
        }

        try {
            // Validate input
            if (!audioBuffer || audioBuffer.length === 0) {
                throw new Error('Invalid audio data: Audio buffer is empty');
            }

            if (audioBuffer.length > 10 * 1024 * 1024) { // 10MB limit
                throw new Error('Audio file too large. Maximum size is 10MB.');
            }

            // Configure speech recognition request
            const request = {
                audio: {
                    content: audioBuffer.toString('base64'),
                },
                config: {
                    encoding: this.getEncodingFromMimeType(mimeType),
                    sampleRateHertz: 16000, // Standard for voice recognition
                    languageCode: 'en-US',
                    enableAutomaticPunctuation: true,
                    enableWordTimeOffsets: false,
                    model: 'short', // Optimized for short audio clips
                    useEnhanced: true,
                    profanityFilter: false, // Let AI handle content moderation
                    speechContexts: [{
                        phrases: [
                            'Salar', 'developer', 'voice assistant', 'AI', 'help'
                        ]
                    }]
                }
            };

            // Perform speech recognition
            const [response] = await this.speechClient.recognize(request);
            const transcription = response.results
                .map(result => result.alternatives[0].transcript)
                .join('\n')
                .trim();

            if (!transcription || transcription.length === 0) {
                throw new Error('No speech detected in the audio');
            }

            // Clean and validate transcription
            return this.cleanTranscription(transcription);

        } catch (error) {
            console.error('Error in speech-to-text conversion:', error);

            // Handle specific error types
            if (error.code === 3) {
                throw new Error('I couldn\'t understand the audio. Please speak clearly and try again.');
            } else if (error.code === 7) {
                throw new Error('Speech recognition service is temporarily unavailable. Please try again later.');
            } else if (error.code === 8) {
                throw new Error('Audio format not supported. Please try a different recording format.');
            } else if (error.code === 2) {
                throw new Error('Invalid audio data. Please ensure the recording is clear and not corrupted.');
            } else {
                throw new Error('Sorry, I didn\'t catch that. Please try again.');
            }
        }
    }

    /**
     * Convert text to speech using Google Text-to-Speech
     * @param {string} text - Text to convert
     * @param {string} voiceType - Voice gender/ type ('male' or 'female')
     * @returns {Promise<Buffer>} Audio data buffer
     */
    async textToSpeech(text, voiceType = 'male') {
        if (!this.initialized) {
            if (!this.initialize()) {
                throw new Error('Text-to-speech service is not properly initialized. Check Google Cloud credentials.');
            }
        }

        try {
            // Validate input
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error('Invalid text: Text must be a non-empty string');
            }

            if (text.length > 5000) { // Limit text length
                throw new Error('Text too long for speech synthesis. Maximum 5000 characters.');
            }

            const cleanText = text.trim().substring(0, 5000);

            // Configure voice based on preference
            const voice = this.getVoiceConfig(voiceType);

            // Configure audio output
            const audioConfig = {
                audioEncoding: 'MP3',
                speakingRate: 0.95, // Slightly slower for clarity
                pitch: 0.0, // Neutral pitch
                volumeGainDb: 0.0, // Normal volume
                sampleRateHertz: 22050, // Good quality for web
                effectsProfileId: ['headphone-class-device'] // Optimized for headphones
            };

            // Build the synthesis request
            const request = {
                input: { text: cleanText },
                voice: voice,
                audioConfig: audioConfig
            };

            // Perform text-to-speech conversion
            const [response] = await this.ttsClient.synthesizeSpeech(request);

            if (!response.audioContent) {
                throw new Error('Failed to generate audio from text');
            }

            return response.audioContent;

        } catch (error) {
            console.error('Error in text-to-speech conversion:', error);

            // Handle specific error types
            if (error.code === 3) {
                throw new Error('The text contains invalid characters for speech synthesis.');
            } else if (error.code === 7) {
                throw new Error('Text-to-speech service is temporarily unavailable. Please try again later.');
            } else if (error.code === 8) {
                throw new Error('Invalid text format provided for speech synthesis.');
            } else {
                throw new Error('I\'m having trouble generating speech right now. Please try again.');
            }
        }
    }

    /**
     * Get Google Speech encoding from MIME type
     * @param {string} mimeType - Audio MIME type
     * @returns {string} Google Speech encoding
     */
    getEncodingFromMimeType(mimeType) {
        const encodingMap = {
            'audio/webm': 'WEBM_OPUS',
            'audio/ogg': 'OGG_OPUS',
            'audio/wav': 'LINEAR16',
            'audio/mp3': 'MP3',
            'audio/mp4': 'MP4'
        };

        return encodingMap[mimeType] || 'WEBM_OPUS';
    }

    /**
     * Get voice configuration based on voice type preference
     * @param {string} voiceType - 'male' or 'female'
     * @returns {Object} Voice configuration
     */
    getVoiceConfig(voiceType) {
        const voiceConfigs = {
            male: {
                languageCode: 'en-US',
                name: 'en-US-Standard-C', // Professional male voice
                ssmlGender: 'MALE'
            },
            female: {
                languageCode: 'en-US',
                name: 'en-US-Standard-E', // Professional female voice
                ssmlGender: 'FEMALE'
            }
        };

        return voiceConfigs[voiceType] || voiceConfigs.male;
    }

    /**
     * Clean and validate transcription text
     * @param {string} transcription - Raw transcription
     * @returns {string} Cleaned transcription
     */
    cleanTranscription(transcription) {
        let cleaned = transcription;

        // Remove excessive whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // Filter out incomplete or problematic transcriptions
        if (cleaned.length < 2) {
            throw new Error('Transcription too short - please speak more clearly');
        }

        // Filter out common speech recognition artifacts
        const artifacts = [
            'um', 'uh', 'er', 'ah', 'mm', 'hmm', 'oh', 'like', 'you know',
            'i mean', 'sort of', 'kind of', 'the', 'and', 'but'
        ];

        // Check if transcription consists mostly of filler words
        const words = cleaned.toLowerCase().split(' ');
        const fillerCount = words.filter(word => artifacts.includes(word)).length;
        const fillerRatio = fillerCount / words.length;

        if (fillerRatio > 0.6 && words.length < 4) {
            throw new Error('Please speak more clearly - I could only hear filler words');
        }

        return cleaned;
    }

    /**
     * Convert audio buffer to required format for Google Speech
     * @param {Buffer} audioBuffer - Original audio buffer
     * @param {string} inputFormat - Input format
     * @returns {Promise<Buffer>} Converted audio buffer
     */
    async convertAudioFormat(audioBuffer, inputFormat) {
        // For now, return the original buffer
        // In a production environment, you might use FFmpeg or similar
        // to convert between formats as needed
        return audioBuffer;
    }

    /**
     * Get supported audio formats
     * @returns {Array} List of supported MIME types
     */
    getSupportedFormats() {
        return [
            'audio/webm',
            'audio/ogg',
            'audio/wav',
            'audio/mp3',
            'audio/mp4'
        ];
    }

    /**
     * Check if the service is properly initialized
     * @returns {boolean} Service status
     */
    isAvailable() {
        return this.initialized && this.speechClient && this.ttsClient;
    }

    /**
     * Get service status information
     * @returns {Object} Status details
     */
    getStatus() {
        return {
            initialized: this.isAvailable(),
            credentialsConfigured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
            speechToTextAvailable: !!this.speechClient,
            textToSpeechAvailable: !!this.ttsClient,
            supportedFormats: this.getSupportedFormats()
        };
    }

    /**
     * Test speech services with a simple request
     * @returns {Promise<Object>} Test results
     */
    async testServices() {
        const results = {
            speechToText: false,
            textToSpeech: false,
            errors: []
        };

        try {
            // Test text-to-speech with simple text
            const testAudio = await this.textToSpeech('Hello, this is a test.');
            results.textToSpeech = testAudio && testAudio.length > 0;
        } catch (error) {
            results.errors.push(`Text-to-speech test failed: ${error.message}`);
        }

        return results;
    }
}

module.exports = SpeechService;