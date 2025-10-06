/**
 * Client-side NSFW Image Detection using nsfwjs
 * Prevents inappropriate images from being uploaded to the server
 */

class NSFWChecker {
    constructor() {
        this.model = null;
        this.isLoading = false;
        this.isLoaded = false;
    }

    async loadModel() {
        if (this.isLoaded) return;
        if (this.isLoading) {
            // Wait for existing load to complete
            while (this.isLoading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isLoading = true;
        try {
            console.log('Loading NSFW detection model...');

            // Check if nsfwjs is loaded
            if (typeof nsfwjs === 'undefined') {
                throw new Error('nsfwjs library not loaded');
            }

            this.model = await nsfwjs.load();
            this.isLoaded = true;
            console.log('NSFW model loaded successfully');
        } catch (error) {
            console.error('Failed to load NSFW model:', error);
            console.error('Make sure TensorFlow.js and NSFWJS are loaded from CDN');
            this.model = null;
        } finally {
            this.isLoading = false;
        }
    }

    async checkImage(imageElement) {
        if (!this.model) {
            console.warn('NSFW model not loaded - skipping check');
            return { safe: true, reason: 'Model not available' };
        }

        try {
            const predictions = await this.model.classify(imageElement);
            console.log('NSFW Predictions:', predictions);

            // Thresholds - STRICTER to catch more NSFW
            const NSFW_THRESHOLD = 0.3;  // Lower = more strict (catch at 30%)
            const SEXY_THRESHOLD = 0.5;   // Catch sexy content at 50%

            const pornPrediction = predictions.find(p => p.className === 'Porn');
            const hentaiPrediction = predictions.find(p => p.className === 'Hentai');
            const sexyPrediction = predictions.find(p => p.className === 'Sexy');

            const isPorn = pornPrediction && pornPrediction.probability > NSFW_THRESHOLD;
            const isHentai = hentaiPrediction && hentaiPrediction.probability > NSFW_THRESHOLD;
            const isSexy = sexyPrediction && sexyPrediction.probability > SEXY_THRESHOLD;

            if (isPorn) {
                return {
                    safe: false,
                    reason: 'Adult content detected',
                    predictions: predictions
                };
            }

            if (isHentai) {
                return {
                    safe: false,
                    reason: 'Explicit artwork detected',
                    predictions: predictions
                };
            }

            if (isSexy) {
                return {
                    safe: false,
                    reason: 'Suggestive content detected',
                    predictions: predictions
                };
            }

            return {
                safe: true,
                reason: 'Image appears safe',
                predictions: predictions
            };
        } catch (error) {
            console.error('Error checking image:', error);
            // Fail open - allow if check fails
            return { safe: true, reason: 'Error during check: ' + error.message };
        }
    }

    async checkFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            return { safe: false, reason: 'Not a valid image file' };
        }

        return new Promise((resolve) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = async (e) => {
                img.src = e.target.result;
            };

            img.onload = async () => {
                const result = await this.checkImage(img);
                URL.revokeObjectURL(img.src);
                resolve(result);
            };

            img.onerror = () => {
                resolve({ safe: false, reason: 'Failed to load image' });
            };

            reader.readAsDataURL(file);
        });
    }
}

// Global instance
window.nsfwChecker = new NSFWChecker();
