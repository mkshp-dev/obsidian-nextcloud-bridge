import { Plugin, MarkdownPostProcessorContext, requestUrl, Notice } from 'obsidian';
import { NextcloudPluginSettings, NextcloudSettingsTab, DEFAULT_SETTINGS } from './settings';

export default class NextcloudPlugin extends Plugin {
    settings: NextcloudPluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new NextcloudSettingsTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor('nextcloud', (source, el, ctx) => {
            this.processNextcloudBlock(source, el, ctx);
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async processNextcloudBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const lines = source.split('\n');
        const params: { [key: string]: any } = {};
        let currentSection = '';

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            if (trimmedLine.startsWith('filter:')) {
                currentSection = 'filter';
                params['filter'] = [];
                return;
            }

            if (currentSection === 'filter') {
                // Check for list item "- key: value"
                const listMatch = trimmedLine.match(/^-\s*(\w+):\s*(.+)$/);
                if (listMatch) {
                    params['filter'].push({ [listMatch[1]]: listMatch[2].trim() });
                    return;
                }
                // If it doesn't match a list item and is not indented, it might be a new top-level key
                if (!line.startsWith(' ') && !line.startsWith('\t') && !trimmedLine.startsWith('-')) {
                    currentSection = '';
                }
            }

            if (currentSection === '') {
                // Support both ; and : for command
                let parts = line.split(':');
                if (parts.length < 2) {
                    parts = line.split(';');
                }

                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    if (key && value) {
                        params[key] = value;
                    }
                }
            }
        });

        if (params['command'] === 'List Files') {
            await this.listFiles(params['folder'] || '/', params['filter'], params['format'], params['list-style'], el);
        } else {
            el.createEl('p', { text: 'Unknown command or missing parameters.' });
        }
    }

    async listFiles(folder: string, filters: any[], format: string, listStyle: string, el: HTMLElement) {
        if (!this.settings.nextcloudUrl || !this.settings.username || !this.settings.password) {
            el.createEl('p', { text: 'Please configure Nextcloud credentials in settings.' });
            return;
        }

        try {
            let cleanFolder = folder.startsWith('/') ? folder : '/' + folder;
            if (cleanFolder !== '/' && cleanFolder.endsWith('/')) {
                cleanFolder = cleanFolder.slice(0, -1);
            }

            let baseUrl = this.settings.nextcloudUrl;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const encodedFolder = cleanFolder.split('/').map(encodeURIComponent).join('/');
            const url = baseUrl + encodedFolder;

            console.log('Fetching files from:', url);

            const response = await requestUrl({
                url: url,
                method: 'PROPFIND',
                headers: {
                    'Authorization': 'Basic ' + btoa(this.settings.username + ':' + this.settings.password),
                    'Depth': '1',
                    'Content-Type': 'application/xml'
                }
            });

            if (response.status >= 200 && response.status < 300) {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(response.text, "text/xml");
                const responses = xmlDoc.querySelectorAll('response');

                const ul = el.createEl('ul');
                if (listStyle === 'none') {
                    ul.addClass('nextcloud-no-bullets');
                }

                let fileCount = 0;

                responses.forEach(resp => {
                    const href = resp.querySelector('href')?.textContent;
                    const displayName = resp.querySelector('propstat prop displayname')?.textContent;

                    if (!href) return;

                    const decodedHref = decodeURIComponent(href);
                    const cleanHref = decodedHref.endsWith('/') ? decodedHref.slice(0, -1) : decodedHref;
                    const cleanRequestedFolder = cleanFolder.endsWith('/') ? cleanFolder.slice(0, -1) : cleanFolder;

                    if (cleanHref.endsWith(cleanRequestedFolder)) {
                        return;
                    }

                    let name = displayName;
                    if (!name && href) {
                        const parts = href.split('/').filter(p => p);
                        name = parts[parts.length - 1];
                    }

                    if (name) {
                        // Apply filters
                        if (filters && filters.length > 0) {
                            let match = true;
                            for (const filter of filters) {
                                if (filter.extension) {
                                    const ext = name.split('.').pop();
                                    // Handle extension: pdf (single) or extension: pdf, jpg (multiple)
                                    const allowedExts = filter.extension.split(',').map((e: string) => e.trim().toLowerCase());
                                    if (!ext || !allowedExts.includes(ext.toLowerCase())) {
                                        match = false;
                                        break;
                                    }
                                }
                            }
                            if (!match) return;
                        }

                        const li = ul.createEl('li');

                        if (format) {
                            // Placeholders: {{name}}, {{filename}}, {{ext}}
                            const ext = name.includes('.') ? name.split('.').pop() || '' : '';
                            const filename = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;

                            let formatted = format
                                .replace(/{{name}}/g, name)
                                .replace(/{{filename}}/g, filename)
                                .replace(/{{ext}}/g, ext);

                            li.setText(formatted);
                        } else {
                            li.setText(name);
                        }

                        fileCount++;
                    }
                });

                if (fileCount === 0) {
                    el.createEl('p', { text: 'No files found matching criteria.' });
                }

            } else {
                throw new Error(`Server returned status ${response.status}`);
            }

        } catch (error) {
            console.error('Nextcloud Error:', error);
            el.createEl('p', { text: `Error fetching files: ${error.message}` });
        }
    }
}
