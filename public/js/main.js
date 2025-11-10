/**
 * Frontend JavaScript for Salar Voice Agent
 * Handles audio recording, API communication, and UI updates
 */

class SalarVoiceApp {
    constructor() {
        // UI Elements
        this.microphoneButton = document.getElementById('microphoneButton');
        this.statusMessage = document.getElementById('statusMessage');
        this.recordingIndicator = document.getElementById('recordingIndicator');
        this.processingIndicator = document.getElementById('processingIndicator');
        this.transcriptContainer = document.getElementById('transcriptContainer');
        this.audioPlayer = document.getElementById('audioPlayer');

        // Audio processing
        this.audioProcessor = null;

        // App state
        this.isRecording = false;
        this.isProcessing = false;
        this.conversationHistory = [];

        // Configuration
        this.apiBaseUrl = window.location.origin;
        this.maxRecordingDuration = 30; // seconds

        // Initialize app
        this.initialize();
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            // Check browser support
            const support = this.checkBrowserSupport();
            if (!support.fullySupported) {
                this.showBrowserNotSupported(support);
                return;
            }

            // Initialize audio processor
            this.audioProcessor = new AudioProcessor();
            await this.audioProcessor.initialize();

            // Setup event listeners
            this.setupEventListeners();

            // Update UI
            this.updateStatus('Click the microphone to start speaking');
            this.clearEmptyTranscript();

            console.log('Salar Voice Agent initialized successfully');

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize voice assistant. Please refresh the page and try again.');
        }
    }

    /**
     * Check browser support for required features
     */
    checkBrowserSupport() {
        return {
            mediaRecorder: !!window.MediaRecorder,
            audioContext: !!(window.AudioContext || window.webkitAudioContext),
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webAudioAPI: !!(window.AudioContext || window.webkitAudioContext),
            fullySupported: !!(window.MediaRecorder &&
                              (window.AudioContext || window.webkitAudioContext) &&
                              (navigator.mediaDevices && navigator.mediaDevices.getUserMedia))
        };
    }

    /**
     * Show browser not supported message
     */
    showBrowserNotSupported(support) {
        const unsupportedFeatures = [];
        if (!support.mediaRecorder) unsupportedFeatures.push('MediaRecorder API');
        if (!support.audioContext) unsupportedFeatures.push('Web Audio API');
        if (!support.getUserMedia) unsupportedFeatures.push('getUserMedia API');

        this.showError(`
            <h3>Browser Not Supported</h3>
            <p>Your browser doesn't support the following features needed for voice interaction:</p>
            <ul>${unsupportedFeatures.map(f => `<li>${f}</li>`).join('')}</ul>
            <p>Please try using a modern browser like Chrome, Firefox, Safari, or Edge.</p>
        `);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Microphone button events
        this.microphoneButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startRecording();
        });

        this.microphoneButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        this.microphoneButton.addEventListener('mouseleave', (e) => {
            if (this.isRecording) {
                e.preventDefault();
                this.stopRecording();
            }
        });

        // Touch events for mobile
        this.microphoneButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });

        this.microphoneButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        this.microphoneButton.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            if (this.isRecording) {
                this.stopRecording();
            }
        });

        // Audio player events
        this.audioPlayer.addEventListener('ended', () => {
            this.updateStatus('Click the microphone to continue speaking');
        });

        this.audioPlayer.addEventListener('error', () => {
            console.error('Audio playback failed');
            this.updateStatus('Audio playback failed. Please try again.');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                if (!this.isRecording && !this.isProcessing) {
                    this.startRecording();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                }
            }
        });

        // Prevent context menu on microphone button
        this.microphoneButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    /**
     * Start audio recording
     */
    async startRecording() {
        if (this.isRecording || this.isProcessing) {
            return;
        }

        try {
            this.isRecording = true;
            this.updateStatus('Listening...');
            this.setRecordingState(true);

            // Start recording
            await this.audioProcessor.startRecording();

            // Set up recording timeout
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                    this.updateStatus('Maximum recording time reached. Processing...');
                }
            }, this.maxRecordingDuration * 1000);

        } catch (error) {
            console.error('Failed to start recording:', error);
            this.isRecording = false;
            this.setRecordingState(false);
            this.showError(error.message);
        }
    }

    /**
     * Stop audio recording and process it
     */
    async stopRecording() {
        if (!this.isRecording) {
            return;
        }

        try {
            // Clear recording timeout
            if (this.recordingTimeout) {
                clearTimeout(this.recordingTimeout);
                this.recordingTimeout = null;
            }

            this.isRecording = false;
            this.setRecordingState(false);
            this.updateStatus('Processing...');
            this.setProcessingState(true);

            // Stop recording and get audio
            const audioBlob = await this.audioProcessor.stopRecording();

            if (!audioBlob) {
                throw new Error('No audio recorded');
            }

            // Process the audio
            await this.processAudio(audioBlob);

        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.isRecording = false;
            this.setRecordingState(false);
            this.setProcessingState(false);
            this.showError(error.message);
        }
    }

    /**
     * Process recorded audio through the backend
     */
    async processAudio(audioBlob) {
        try {
            // Create form data
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('voiceType', 'male');
            formData.append('conversationHistory', JSON.stringify(this.conversationHistory));

            // Send to backend
            const response = await fetch(`${this.apiBaseUrl}/api/voice/process`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (!result.success) {
                throw new Error(result.error || 'Processing failed');
            }

            // Handle successful response
            await this.handleProcessingResult(result);

        } catch (error) {
            console.error('Audio processing failed:', error);
            this.showError(error.message);
        } finally {
            this.setProcessingState(false);
        }
    }

    /**
     * Handle successful processing result
     */
    async handleProcessingResult(result) {
        try {
            // Add user message to conversation
            this.addMessageToTranscript('user', result.transcription);

            // Add assistant message to conversation
            this.addMessageToTranscript('assistant', result.response);

            // Update conversation history
            this.conversationHistory.push(
                { role: 'user', content: result.transcription },
                { role: 'assistant', content: result.response }
            );

            // Keep only last 10 messages to maintain context
            if (this.conversationHistory.length > 10) {
                this.conversationHistory = this.conversationHistory.slice(-10);
            }

            // Play audio response if available
            if (result.audio) {
                await this.playAudioResponse(result.audio);
            } else {
                this.updateStatus('Click the microphone to continue speaking');
            }

        } catch (error) {
            console.error('Failed to handle processing result:', error);
            this.showError('Failed to process response. Please try again.');
        }
    }

    /**
     * Play audio response
     */
    async playAudioResponse(audioDataUrl) {
        try {
            this.audioPlayer.src = audioDataUrl;
            await this.audioPlayer.play();
            this.updateStatus('Playing response...');
        } catch (error) {
            console.error('Failed to play audio:', error);
            this.updateStatus('Failed to play audio response');
        }
    }

    /**
     * Add message to transcript
     */
    addMessageToTranscript(role, content) {
        // Remove empty transcript message if this is the first message
        this.clearEmptyTranscript();

        const messageDiv = document.createElement('div');
        messageDiv.className = 'transcript-item';

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `message-avatar ${role}-avatar`;
        avatarDiv.textContent = role === 'user' ? 'You' : 'SA';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const messageP = document.createElement('p');
        messageP.textContent = content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        contentDiv.appendChild(messageP);
        contentDiv.appendChild(timeDiv);

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);

        // Add message to transcript
        this.transcriptContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;

        // Add message classes
        const messageClass = role === 'user' ? 'user-message' : 'assistant-message';
        contentDiv.classList.add(messageClass);
    }

    /**
     * Clear empty transcript placeholder
     */
    clearEmptyTranscript() {
        const emptyMessage = this.transcriptContainer.querySelector('.transcript-empty');
        if (emptyMessage) {
            emptyMessage.parentElement.remove();
        }
    }

    /**
     * Update status message
     */
    updateStatus(message) {
        this.statusMessage.textContent = message;
    }

    /**
     * Set recording state UI
     */
    setRecordingState(isRecording) {
        if (isRecording) {
            this.microphoneButton.classList.add('recording');
            this.recordingIndicator.classList.add('active');
        } else {
            this.microphoneButton.classList.remove('recording');
            this.recordingIndicator.classList.remove('active');
        }
    }

    /**
     * Set processing state UI
     */
    setProcessingState(isProcessing) {
        if (isProcessing) {
            this.processingIndicator.classList.add('active');
            this.microphoneButton.disabled = true;
        } else {
            this.processingIndicator.classList.remove('active');
            this.microphoneButton.disabled = false;
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.updateStatus('Error occurred');

        // Create error element
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        `;

        // Insert after status message
        this.statusMessage.parentNode.insertBefore(errorDiv, this.statusMessage.nextSibling);

        // Remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);

        // Reset UI after a delay
        setTimeout(() => {
            this.updateStatus('Click the microphone to start speaking');
            this.setProcessingState(false);
        }, 3000);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.audioProcessor) {
            this.audioProcessor.cleanup();
        }

        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
        }

        this.audioPlayer.pause();
        this.audioPlayer.src = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.salarApp = new SalarVoiceApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.salarApp) {
        window.salarApp.cleanup();
    }
});

// Handle visibility change (app switching)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.salarApp) {
        // Stop recording if app becomes hidden
        if (window.salarApp.isRecording) {
            window.salarApp.stopRecording();
        }
    }
});