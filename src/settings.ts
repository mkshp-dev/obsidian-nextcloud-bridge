import { App, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import NextcloudPlugin from './main';

export interface NextcloudPluginSettings {
    nextcloudUrl: string;
    username: string;
    password: string;
}

export const DEFAULT_SETTINGS: NextcloudPluginSettings = {
    nextcloudUrl: '',
    username: '',
    password: ''
}

export class NextcloudSettingsTab extends PluginSettingTab {
    plugin: NextcloudPlugin;

    constructor(app: App, plugin: NextcloudPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Connection')
            .setHeading();

        new Setting(containerEl)
            .setName('Nextcloud URL')
            .setDesc('The base URL of your Nextcloud instance (e.g., https://cloud.example.com/remote.php/dav/files/username/)')
            .addText(text => text
                .setPlaceholder('https://cloud.example.com/remote.php/dav/files/username/')
                .setValue(this.plugin.settings.nextcloudUrl)
                .onChange(async (value) => {
                    this.plugin.settings.nextcloudUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Username')
            .setDesc('Your nextcloud username')
            .addText(text => text
                .setPlaceholder('Username')
                .setValue(this.plugin.settings.username)
                .onChange(async (value) => {
                    this.plugin.settings.username = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Password')
            .setDesc('Your nextcloud password or app password (recommended)')
            .addText(text => text
                .setPlaceholder('Password')
                .setValue(this.plugin.settings.password)
                .onChange(async (value) => {
                    this.plugin.settings.password = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.type = 'password');

        new Setting(containerEl)
            .setName('Test connection')
            .setDesc('Verify your nextcloud credentials')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);
                    try {
                        // console.log('Testing connection to:', this.plugin.settings.nextcloudUrl);

                        // Try direct requestUrl to bypass CORS
                        const response = await requestUrl({
                            url: this.plugin.settings.nextcloudUrl,
                            method: 'PROPFIND',
                            headers: {
                                'Authorization': 'Basic ' + btoa(this.plugin.settings.username + ':' + this.plugin.settings.password),
                                'Depth': '1'
                            }
                        });

                        // console.log('Test Response:', response.status);

                        if (response.status >= 200 && response.status < 300) {
                            new Notice('Connection successful!');
                            button.setButtonText('Success');
                        } else {
                            throw new Error(`Server returned status ${response.status}`);
                        }
                    } catch (error) {
                        console.error('Nextcloud Connection Error:', error);
                        let message = `Connection failed: ${error.message}`;
                        if (error.message === '401 Unauthorized') {
                            message = 'Authentication failed. Check username and app password.';
                        } else if (error.message.includes('404')) {
                            message = 'URL not found. Check your Nextcloud URL.';
                        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
                            message = 'Network error. Check URL and CORS settings (if self-hosted).';
                        }
                        new Notice(message);
                        button.setButtonText('Failed');
                    } finally {
                        button.setDisabled(false);
                        setTimeout(() => button.setButtonText('Test'), 2000);
                    }
                }));
    }
}
