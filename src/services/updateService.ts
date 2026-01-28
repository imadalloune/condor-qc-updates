import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { CURRENT_APP_VERSION_CODE, CURRENT_APP_VERSION_NAME } from '@/utils/version';

export interface UpdateInfo {
    version: string;
    versionCode: number;
    downloadUrl: string;
    changelog: string;
    mandatory: boolean;
    releaseDate: string;
    minVersion?: string;
}

const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/imadalloune/condor-qc-updates/main/version.json';
const CURRENT_VERSION = CURRENT_APP_VERSION_NAME;
const CURRENT_VERSION_CODE = CURRENT_APP_VERSION_CODE;

export class UpdateService {
    /**
     * Check if a new update is available
     */
    static async checkForUpdates(): Promise<UpdateInfo | null> {
        try {
            // Only check for updates on native platforms
            if (!Capacitor.isNativePlatform()) {
                console.log('Update check skipped: not on native platform');
                return null;
            }

            const response = await fetch(UPDATE_CHECK_URL);
            if (!response.ok) {
                throw new Error('Failed to fetch update info');
            }

            const updateInfo: UpdateInfo = await response.json();

            // Check if update is available
            if (updateInfo.versionCode > CURRENT_VERSION_CODE) {
                return updateInfo;
            }

            return null;
        } catch (error) {
            console.error('Error checking for updates:', error);
            return null;
        }
    }

    /**
     * Download and install the update
     */
    static async downloadAndInstall(
        downloadUrl: string,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        try {
            if (!Capacitor.isNativePlatform()) {
                throw new Error('Les mises à jour sont uniquement disponibles sur mobile.');
            }

            const fileName = `update_v${Date.now()}.apk`;

            console.log('Starting download from:', downloadUrl);

            // Use Filesystem.downloadFile if available (more reliable for large files)
            if (typeof (Filesystem as any).downloadFile === 'function') {
                let progressListener: any;

                if (onProgress) {
                    progressListener = await (Filesystem as any).addListener('progress', (status: any) => {
                        if (status.contentLength > 0) {
                            const progress = (status.bytes / status.contentLength) * 100;
                            onProgress(progress);
                        }
                    });
                }

                try {
                    await (Filesystem as any).downloadFile({
                        url: downloadUrl,
                        path: fileName,
                        directory: Directory.Cache,
                        progress: true
                    });

                    // Get the content URI for the downloaded file
                    const uriResult = await Filesystem.getUri({
                        path: fileName,
                        directory: Directory.Cache
                    });

                    await this.installApk(uriResult.uri);
                    return;
                } finally {
                    if (progressListener) {
                        await progressListener.remove();
                    }
                }
            }

            // Fallback to the previous method if downloadFile is not available
            // but with better error handling
            const xhr = new XMLHttpRequest();
            xhr.open('GET', downloadUrl, true);
            xhr.responseType = 'blob';

            const blob = await new Promise<Blob>((resolve, reject) => {
                xhr.onprogress = (event) => {
                    if (event.lengthComputable && onProgress) {
                        const progress = (event.loaded / event.total) * 100;
                        onProgress(progress);
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(xhr.response);
                    } else {
                        reject(new Error(`Le téléchargement a échoué (Status: ${xhr.status})`));
                    }
                };

                xhr.onerror = () => reject(new Error('Erreur réseau lors du téléchargement. Vérifiez votre connexion.'));
                xhr.ontimeout = () => reject(new Error('Le téléchargement a expiré.'));
                xhr.send();
            });

            console.log('Download finished, converting to base64...');
            const base64Data = await this.blobToBase64(blob);

            console.log('Writing file to cache...');
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache,
            });

            await this.installApk(result.uri);
        } catch (error: any) {
            console.error('Error in downloadAndInstall:', error);
            throw new Error(error.message || 'Échec du téléchargement');
        }
    }

    /**
     * Convert blob to base64
     */
    private static blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                const base64Data = base64.split(',')[1];
                resolve(base64Data);
            };
            reader.onerror = () => reject(new Error('Erreur de conversion du fichier (mémoire insuffisante ?)'));
            reader.readAsDataURL(blob);
        });
    }

    /**
   * Install APK (Android only)
   */
    private static async installApk(fileUri: string): Promise<void> {
        if (Capacitor.getPlatform() === 'android') {
            try {
                const AppInstaller = (await import('@/plugins/appInstaller')).default;
                await AppInstaller.installApk({ filePath: fileUri });
            } catch (error) {
                console.error('Failed to install APK:', error);
                throw error;
            }
        }
    }

    /**
     * Get current app version
     */
    static getCurrentVersion(): { version: string; versionCode: number } {
        return {
            version: CURRENT_VERSION,
            versionCode: CURRENT_VERSION_CODE,
        };
    }

    /**
     * Schedule periodic update checks
     */
    static scheduleUpdateChecks(intervalMinutes: number = 60): void {
        // Check immediately
        this.checkForUpdates();

        // Then check periodically
        setInterval(() => {
            this.checkForUpdates();
        }, intervalMinutes * 60 * 1000);
    }
}
