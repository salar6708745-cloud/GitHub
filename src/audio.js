/**
 * Audio processing utilities for Salar Voice Agent
 * Handles audio recording, format conversion, and playback
 */

class AudioProcessor {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.stream = null;
        this.isRecording = false;
        this.audioPlayer = new Audio();
    }

    /**
     * Initialize audio context and request microphone permission
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            return true;
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            throw new Error('Audio context initialization failed');
        }
    }

    /**
     * Request microphone permission from user
     * @returns {Promise<boolean>} Permission granted status
     */
    async requestMicrophonePermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });
            return true;
        } catch (error) {
            console.error('Microphone permission denied:', error);
            if (error.name === 'NotAllowedError') {
                throw new Error('Microphone permission denied. Please allow microphone access to use voice features.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No microphone found. Please connect a microphone and try again.');
            } else {
                throw new Error('Failed to access microphone: ' + error.message);
            }
        }
    }

    /**
     * Start audio recording
     * @returns {Promise<void>}
     */
    async startRecording() {
        if (this.isRecording) {
            throw new Error('Recording already in progress');
        }

        try {
            if (!this.stream) {
                await this.requestMicrophonePermission();
            }

            this.audioChunks = [];

            // Determine supported MIME type
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                'audio/wav'
            ];

            let mimeType = 'audio/webm';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    break;
                }
            }

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.isRecording = false;
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.stopRecording();
                throw new Error('Recording failed: ' + event.error.message);
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;

        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    /**
     * Stop audio recording and return audio blob
     * @returns {Promise<Blob>} Audio data
     */
    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            throw new Error('No recording in progress');
        }

        return new Promise((resolve, reject) => {
            try {
                this.mediaRecorder.onstop = async () => {
                    this.isRecording = false;

                    if (this.audioChunks.length === 0) {
                        reject(new Error('No audio data recorded'));
                        return;
                    }

                    const audioBlob = new Blob(this.audioChunks, {
                        type: this.mediaRecorder.mimeType
                    });

                    // Validate audio data
                    if (audioBlob.size < 1024) { // Less than 1KB seems too small
                        reject(new Error('Audio recording too short or empty'));
                        return;
                    }

                    // Validate duration (rough estimate)
                    const duration = await this.getAudioDuration(audioBlob);
                    if (duration < 0.5) { // Less than 0.5 seconds
                        reject(new Error('Audio recording too short. Please speak for at least 1 second.'));
                        return;
                    }

                    if (duration > 30) { // More than 30 seconds
                        reject(new Error('Audio recording too long. Please keep recordings under 30 seconds.'));
                        return;
                    }

                    resolve(audioBlob);
                };

                this.mediaRecorder.stop();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get approximate audio duration from blob
     * @param {Blob} audioBlob
     * @returns {Promise<number>} Duration in seconds
     */
    async getAudioDuration(audioBlob) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration);
            });
            audio.addEventListener('error', () => {
                resolve(0); // Default to 0 if can't determine duration
            });
            audio.src = URL.createObjectURL(audioBlob);
        });
    }

    /**
     * Convert audio blob to base64 for upload
     * @param {Blob} audioBlob
     * @returns {Promise<string>} Base64 encoded audio
     */
    async blobToBase64(audioBlob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1]; // Remove data: prefix
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
        });
    }

    /**
     * Play audio response
     * @param {string} audioUrl URL or base64 audio data
     * @returns {Promise<void>}
     */
    async playAudio(audioUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.audioPlayer.src = audioUrl;

                this.audioPlayer.onended = () => {
                    resolve();
                };

                this.audioPlayer.onerror = (error) => {
                    console.error('Audio playback error:', error);
                    reject(new Error('Failed to play audio response'));
                };

                this.audioPlayer.play().catch(error => {
                    console.error('Audio play failed:', error);
                    reject(new Error('Audio playback failed: ' + error.message));
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop current audio playback
     */
    stopAudio() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.currentTime = 0;
        }
    }

    /**
     * Get real-time volume level during recording
     * @returns {Promise<number>} Volume level (0-100)
     */
    async getVolumeLevel() {
        if (!this.stream) return 0;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(this.stream);
            const analyser = audioContext.createAnalyser();

            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);

            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;

            // Normalize to 0-100
            return Math.min(100, Math.round((average / 128) * 100));

        } catch (error) {
            console.error('Error getting volume level:', error);
            return 0;
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopRecording();
        this.stopAudio();

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.mediaRecorder = null;
        this.audioChunks = [];
    }

    /**
     * Check if browser supports required audio features
     * @returns {Object} Support status
     */
    static checkBrowserSupport() {
        const support = {
            mediaRecorder: !!window.MediaRecorder,
            audioContext: !!(window.AudioContext || window.webkitAudioContext),
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webAudioAPI: !!(window.AudioContext || window.webkitAudioContext)
        };

        support.fullySupported = Object.values(support).every(Boolean);

        return support;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioProcessor;
} else {
    window.AudioProcessor = AudioProcessor;
}