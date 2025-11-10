/**
 * Express.js backend server for Salar Voice Agent
 * Handles audio upload, speech processing, and AI responses
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import services
const GeminiService = require('./src/gemini');
const SpeechService = require('./src/speech');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const geminiService = new GeminiService();
const speechService = new SpeechService();

// Configure multer for audio file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'audio/webm',
            'audio/ogg',
            'audio/wav',
            'audio/mp3',
            'audio/mp4',
            'audio/mpeg',
            'audio/x-m4a'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`));
        }
    }
});

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 requests per minute
    message: {
        error: 'Too many requests. Please try again later.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            gemini: geminiService.getStatus(),
            speech: speechService.getStatus()
        },
        version: '1.0.0'
    };

    res.json(status);
});

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Main voice processing endpoint
 * Handles the complete flow: audio -> text -> AI -> speech
 */
app.post('/api/voice/process', upload.single('audio'), async (req, res) => {
    let startTime = Date.now();

    try {
        // Validate request
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }

        const { voiceType = 'male', conversationHistory = [] } = req.body;

        // Parse conversation history
        let history = [];
        try {
            if (conversationHistory && typeof conversationHistory === 'string') {
                history = JSON.parse(conversationHistory);
            } else if (Array.isArray(conversationHistory)) {
                history = conversationHistory;
            }
        } catch (error) {
            console.warn('Invalid conversation history format:', error.message);
        }

        console.log(`Processing audio: ${req.file.originalname}, size: ${req.file.size} bytes`);

        // Step 1: Convert speech to text
        let transcription;
        try {
            transcription = await speechService.speechToText(req.file.buffer, req.file.mimetype);
            console.log(`Transcription: "${transcription}"`);
        } catch (error) {
            console.error('Speech-to-text failed:', error);
            return res.status(400).json({
                success: false,
                error: error.message,
                step: 'speech-to-text'
            });
        }

        // Step 2: Get AI response
        let aiResponse;
        try {
            aiResponse = await geminiService.getResponse(transcription, history);
            console.log(`AI Response: "${aiResponse.substring(0, 100)}..."`);
        } catch (error) {
            console.error('Gemini AI failed:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
                step: 'ai-processing',
                transcription: transcription // Return transcription so user knows what was understood
            });
        }

        // Step 3: Convert text response to speech
        let audioBuffer;
        try {
            audioBuffer = await speechService.textToSpeech(aiResponse, voiceType);
            console.log(`Generated audio: ${audioBuffer.length} bytes`);
        } catch (error) {
            console.error('Text-to-speech failed:', error);
            // Return text response if TTS fails
            return res.json({
                success: true,
                transcription: transcription,
                response: aiResponse,
                audio: null,
                error: 'Speech generation failed, but you can read the response above.',
                processingTime: Date.now() - startTime
            });
        }

        // Convert audio to base64 for frontend
        const audioBase64 = audioBuffer.toString('base64');
        const audioDataUrl = `data:audio/mp3;base64,${audioBase64}`;

        // Return successful response
        res.json({
            success: true,
            transcription: transcription,
            response: aiResponse,
            audio: audioDataUrl,
            processingTime: Date.now() - startTime
        });

    } catch (error) {
        console.error('Voice processing error:', error);
        res.status(500).json({
            success: false,
            error: 'An unexpected error occurred during voice processing',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Text-only chat endpoint (for testing or fallback)
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a string'
            });
        }

        // Parse conversation history
        let history = [];
        try {
            if (conversationHistory && typeof conversationHistory === 'string') {
                history = JSON.parse(conversationHistory);
            } else if (Array.isArray(conversationHistory)) {
                history = conversationHistory;
            }
        } catch (error) {
            console.warn('Invalid conversation history format:', error.message);
        }

        // Get AI response
        const aiResponse = await geminiService.getResponse(message, history);

        res.json({
            success: true,
            message: message,
            response: aiResponse
        });

    } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Text-to-speech endpoint
 */
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voiceType = 'male' } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Text is required and must be a string'
            });
        }

        // Generate speech
        const audioBuffer = await speechService.textToSpeech(text, voiceType);

        // Set appropriate headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', audioBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        // Send audio buffer
        res.send(audioBuffer);

    } catch (error) {
        console.error('TTS endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Service status endpoint
 */
app.get('/api/status', (req, res) => {
    const status = {
        services: {
            gemini: geminiService.getStatus(),
            speech: speechService.getStatus()
        },
        environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: PORT,
            timestamp: new Date().toISOString()
        }
    };

    res.json(status);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'Audio file too large. Maximum size is 10MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Only one audio file is allowed.'
            });
        }
    }

    res.status(500).json({
        success: false,
        error: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🎙️  Salar Voice Agent server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} to start using the voice assistant`);
    console.log(`🔧 Health check available at http://localhost:${PORT}/health`);

    // Check service initialization
    const geminiStatus = geminiService.isAvailable();
    const speechStatus = speechService.isAvailable();

    if (!geminiStatus) {
        console.error('⚠️  Gemini AI not initialized. Check GEMINI_API_KEY environment variable.');
    }

    if (!speechStatus) {
        console.error('⚠️  Google Cloud Speech services not initialized. Check GOOGLE_APPLICATION_CREDENTIALS environment variable.');
    }

    if (geminiStatus && speechStatus) {
        console.log('✅ All services initialized successfully');
    }
});

module.exports = app;