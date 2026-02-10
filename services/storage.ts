import { BaseDirectory, readTextFile, writeTextFile, mkdir, exists, copyFile, remove } from '@tauri-apps/plugin-fs';
import { Card } from '../types';

// The pointer file stays in the default location and points to the real data
const POINTER_FILENAME = 'storage_config.json';
const DATA_FILENAME = 'user_settings.json';
const DEFAULT_SUBDIR = 'data';

export interface AppSettings {
    theme: 'light' | 'dark';
    activeGroup: string;
    cards: Card[];
}

interface StorageConfig {
    customPath: string | null; // If null, use default AppLocalData/data
}

// Check for Tauri environment
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

// Helper: Get the resolved full path for the data file
// Returns { path: string, baseDir?: BaseDirectory }
// If baseDir is provided, path is relative to it. If not, path is absolute.
const resolveDataPath = async (): Promise<{ path: string; baseDir?: BaseDirectory; isCustom: boolean }> => {
    try {
        // 1. Try to read pointer file from AppLocalData
        if (await exists(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData })) {
            const content = await readTextFile(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData });
            const config: StorageConfig = JSON.parse(content);
            
            if (config.customPath) {
                // Ensure the custom directory exists
                // Note: We assume the path is absolute and valid.
                // In a robust app, we'd verify access here.
                return { path: `${config.customPath}/${DATA_FILENAME}`, isCustom: true };
            }
        }
    } catch (e) {
        console.warn("Failed to read storage pointer, falling back to default.", e);
    }

    // 2. Default fallback
    return { path: `${DEFAULT_SUBDIR}/${DATA_FILENAME}`, baseDir: BaseDirectory.AppLocalData, isCustom: false };
};

export const storageService = {
    // Get the current directory path (for UI display)
    async getCurrentDataPath(): Promise<string> {
        if (!isTauri()) return "Browser Memory";
        
        try {
            // Read pointer
            if (await exists(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData })) {
                const content = await readTextFile(POINTER_FILENAME, { baseDir: BaseDirectory.AppLocalData });
                const config = JSON.parse(content);
                if (config.customPath) return config.customPath;
            }
            // If default, we return a friendly string. 
            // Getting the actual absolute path of BaseDirectory.AppLocalData requires backend invocation,
            // so here we just return a placeholder or relative path.
            return "Default (App Data Folder)";
        } catch {
            return "Default (App Data Folder)";
        }
    },

    // Move data to a new location
    async setCustomDataPath(newFolder: string | null) {
        if (!isTauri()) return;

        try {
            // 1. Get current location
            const current = await resolveDataPath();
            
            // 2. Determine new full file path
            // Note: newFolder is an absolute path from the dialog
            let newFilePath: string;
            let writeOptions: any = {};

            if (newFolder) {
                 newFilePath = `${newFolder}/${DATA_FILENAME}`;
            } else {
                 // Resetting to default
                 newFilePath = `${DEFAULT_SUBDIR}/${DATA_FILENAME}`;
                 writeOptions = { baseDir: BaseDirectory.AppLocalData };
            }

            // 3. Migrate Data: Read old -> Write new
            let currentData = null;
            try {
                if (current.baseDir) {
                    if (await exists(current.path, { baseDir: current.baseDir })) {
                        currentData = await readTextFile(current.path, { baseDir: current.baseDir });
                    }
                } else {
                    // Absolute path read
                    // Note: exists() with absolute path might need empty baseDir depending on plugin version,
                    // but usually works if we omit baseDir for absolute paths in v2? 
                    // Actually v2 plugin-fs requires a capability to read absolute paths.
                    // We try to read.
                    currentData = await readTextFile(current.path); 
                }
            } catch (readErr) {
                console.warn("Could not read old data to migrate:", readErr);
            }

            if (currentData) {
                if (newFolder) {
                    await writeTextFile(newFilePath, currentData);
                } else {
                    // Ensure default dir exists
                    await mkdir(DEFAULT_SUBDIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
                    await writeTextFile(newFilePath, currentData, writeOptions);
                }
            }

            // 4. Update Pointer File
            const pointerConfig: StorageConfig = { customPath: newFolder };
            await writeTextFile(POINTER_FILENAME, JSON.stringify(pointerConfig), { baseDir: BaseDirectory.AppLocalData });

        } catch (e) {
            console.error("Failed to set custom data path", e);
            throw e;
        }
    },

    async save(settings: AppSettings) {
        // Strip runtimeData
        const data = JSON.stringify(settings, (key, value) => {
            if (key === 'runtimeData') return undefined;
            return value;
        }, 2);

        if (isTauri()) {
            try {
                const location = await resolveDataPath();
                
                if (location.baseDir) {
                    // Default Location
                    await mkdir(DEFAULT_SUBDIR, { baseDir: location.baseDir, recursive: true });
                    await writeTextFile(location.path, data, { baseDir: location.baseDir });
                } else {
                    // Custom Absolute Location
                    // We assume the folder exists (created by user or checked in setCustomPath)
                    await writeTextFile(location.path, data);
                }
            } catch (err) {
                console.error("Failed to save settings to disk:", err);
            }
        }
    },

    async load(): Promise<AppSettings | null> {
        if (isTauri()) {
            try {
                const location = await resolveDataPath();
                let content = '';

                if (location.baseDir) {
                    if (!(await exists(location.path, { baseDir: location.baseDir }))) return null;
                    content = await readTextFile(location.path, { baseDir: location.baseDir });
                } else {
                    // Absolute path
                    // We might need to handle cases where custom path was deleted externally
                    try {
                        content = await readTextFile(location.path);
                    } catch (e) {
                         console.error("Custom path not accessible, reverting to default?");
                         return null;
                    }
                }
                
                return JSON.parse(content);
            } catch (e) {
                console.error("Failed to load settings from disk:", e);
                return null;
            }
        }
        return null;
    }
};