/**
 * Shared media utilities for all post gateways
 * Eliminates code duplication across X, Instagram, TikTok gateways
 */

/**
 * Video file extensions supported across platforms
 */
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

/**
 * Image file extensions supported across platforms
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/**
 * Determine if a URL points to a video file
 */
export function isVideoFile(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
}

/**
 * Determine if a URL points to an image file
 */
export function isImageFile(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
}

/**
 * Get media type from URL
 */
export function getMediaType(url: string): 'video' | 'image' | 'unknown' {
    if (isVideoFile(url)) return 'video';
    if (isImageFile(url)) return 'image';
    return 'unknown';
}

/**
 * Get file extension from URL (including the dot)
 */
export function getFileExtension(url: string): string {
    const lowerUrl = url.toLowerCase();
    const match = lowerUrl.match(/\.([\w]+)(?:\?|$)/);
    return match ? `.${match[1]}` : '';
}

/**
 * Get MIME type from file URL
 * Used for Twitter/X uploads
 */
export function getMimeType(url: string): string {
    const lowerUrl = url.toLowerCase();

    // Video types
    if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.m4v')) {
        return 'video/mp4';
    }
    if (lowerUrl.endsWith('.mov')) {
        return 'video/quicktime';
    }
    if (lowerUrl.endsWith('.webm')) {
        return 'video/webm';
    }
    if (lowerUrl.endsWith('.avi')) {
        return 'video/x-msvideo';
    }

    // Image types
    if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) {
        return 'image/jpeg';
    }
    if (lowerUrl.endsWith('.png')) {
        return 'image/png';
    }
    if (lowerUrl.endsWith('.gif')) {
        return 'image/gif';
    }
    if (lowerUrl.endsWith('.webp')) {
        return 'image/webp';
    }

    // Default fallback
    return 'image/jpeg';
}
