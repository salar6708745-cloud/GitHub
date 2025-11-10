# Salar Voice Agent

A professional, friendly voice assistant powered by Google's Gemini AI and Google Cloud Speech services. Salar provides intelligent voice conversations through a web-based interface, always maintaining a warm and professional demeanor.

## Features

- 🎙️ **Voice Interaction**: Click-to-talk interface for natural voice conversations
- 🤖 **AI-Powered**: Powered by Google's Gemini AI for intelligent responses
- 🗣️ **Speech Recognition**: Google Cloud Speech-to-Text for accurate transcription
- 🔊 **Text-to-Speech**: Natural-sounding voice responses
- 💬 **Conversation Memory**: Maintains conversation context for coherent interactions
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔒 **Secure**: API keys and credentials are server-side only

## Prerequisites

- Node.js 18.x or higher
- Google Gemini API key
- Google Cloud service account with Speech-to-Text and Text-to-Speech APIs enabled
- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)

## Setup Instructions

### 1. Google Cloud Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the following APIs:
     - Cloud Speech-to-Text API
     - Cloud Text-to-Speech API

2. **Create Service Account**
   ```bash
   # Create service account
   gcloud iam service-accounts create salar-voice-agent

   # Grant necessary permissions
   gcloud projects add-iam-policy-binding PROJECT_ID \
       --member="serviceAccount:salar-voice-agent@PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/speech.client"

   gcloud projects add-iam-policy-binding PROJECT_ID \
       --member="serviceAccount:salar-voice-agent@PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/texttospeech.user"

   # Create and download service account key
   gcloud iam service-accounts keys create ~/salar-service-account.json \
       --iam-account=salar-voice-agent@PROJECT_ID.iam.gserviceaccount.com
   ```

### 2. Gemini API Setup

1. **Get Gemini API Key**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key for use in environment variables

### 3. Project Installation

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd salar-voice-agent
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env with your actual credentials
   nano .env
   ```

4. **Update .env with your credentials:**
   ```env
   # Gemini API Configuration
   GEMINI_API_KEY=your_actual_gemini_api_key_here

   # Google Cloud Configuration
   GOOGLE_APPLICATION_CREDENTIALS=./salar-service-account.json

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```

5. **Move Service Account Key**
   ```bash
   # Move your downloaded service account key to the project directory
   mv ~/salar-service-account.json .
   ```

### 4. Start the Application

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

Open your browser and navigate to `http://localhost:3000`

## Usage

1. **Allow Microphone Access**: When prompted, allow the browser to access your microphone
2. **Click and Hold**: Press and hold the microphone button while speaking
3. **Release to Process**: Release the button to send your speech for processing
4. **Listen to Response**: Salar will respond with both text and audio

### Keyboard Shortcuts
- **Spacebar**: Press and hold to record, release to send (alternative to clicking)

## Special Features

### Developer Question
When asked "Who developed you?" or similar questions, Salar will always respond:
> "Salar is my developer - he taught me everything I know."

### Conversation Context
Salar maintains conversation context for coherent, multi-turn conversations. The last 10 messages are kept to maintain context while managing memory usage.

## API Endpoints

### Voice Processing
- `POST /api/voice/process` - Main voice processing endpoint
- `POST /api/chat` - Text-only chat (for testing)
- `POST /api/tts` - Text-to-speech conversion
- `GET /api/status` - Service status check
- `GET /health` - Health check

### Request Format (Voice Processing)
```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('voiceType', 'male'); // or 'female'
formData.append('conversationHistory', JSON.stringify(history));

const response = await fetch('/api/voice/process', {
    method: 'POST',
    body: formData
});
```

## File Structure

```
salar-voice-agent/
├── index.html                 # Main frontend interface
├── server.js                 # Express server entry point
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── src/
│   ├── audio.js              # Audio processing utilities
│   ├── gemini.js             # Gemini API integration
│   ├── speech.js             # Google Speech services
│   └── utils.js              # Helper functions
├── public/
│   ├── css/
│   │   └── style.css         # Application styles
│   └── js/
│       └── main.js           # Frontend JavaScript
└── README.md                 # This file
```

## Error Handling

The application includes comprehensive error handling for:

- **Microphone Permission Denied**: Shows browser permission instructions
- **Network Issues**: Displays connection error messages
- **API Failures**: Graceful degradation with helpful error messages
- **Invalid Audio**: Prompts user to try again with clear audio
- **Service Unavailable**: Fallback responses when services are down

## Browser Compatibility

- ✅ Chrome 88+
- ✅ Firefox 85+
- ✅ Safari 14+
- ✅ Edge 88+
- ✅ Mobile Chrome/Safari

## Troubleshooting

### Common Issues

1. **"Microphone permission denied"**
   - Check browser permissions for microphone access
   - Try refreshing the page and allowing microphone access

2. **"Speech services not initialized"**
   - Verify Google Cloud credentials are properly set
   - Check that required APIs are enabled in Google Cloud Console

3. **"Audio processing failed"**
   - Check internet connection
   - Verify API keys are correct and active
   - Check browser console for detailed error messages

4. **"No audio detected"**
   - Speak clearly and ensure microphone is working
   - Check microphone volume settings
   - Try a shorter recording

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

Check browser console for detailed error information and network requests.

## Security Considerations

- API keys are stored server-side and never exposed to the browser
- Rate limiting prevents abuse (30 requests per minute per IP)
- Audio files are limited to 10MB and 30 seconds duration
- Input validation and sanitization on all endpoints
- HTTPS recommended for production deployments

## Performance Optimization

- Audio compression reduces bandwidth usage
- Conversation history limited to maintain performance
- Efficient error handling prevents resource leaks
- Lazy loading of audio processing resources

## Deployment

### Production Setup

1. **Environment Variables**
   ```bash
   export NODE_ENV=production
   export PORT=3000
   export GEMINI_API_KEY=your_production_key
   export GOOGLE_APPLICATION_CREDENTIALS=./prod-service-account.json
   ```

2. **Using PM2 (Recommended)**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "salar-voice-agent"
   pm2 startup
   pm2 save
   ```

3. **Nginx Reverse Proxy**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review browser console for detailed error messages
3. Verify all configuration steps are complete
4. Check Google Cloud Console for API quota issues

## Acknowledgments

- Google Gemini API for AI capabilities
- Google Cloud Speech services for voice processing
- Web Audio API for browser-based audio handling
- Express.js for backend infrastructure