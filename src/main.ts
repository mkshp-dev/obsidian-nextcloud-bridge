import { Plugin, MarkdownPostProcessorContext, requestUrl, Notice } from 'obsidian';
import { NextcloudPluginSettings, NextcloudSettingsTab, DEFAULT_SETTINGS } from './settings';

export interface NextcloudBridgeAPI {
    runQuery(queryText: string): Promise<string[]>;
}

export default class NextcloudPlugin extends Plugin {
    settings: NextcloudPluginSettings;
    api: NextcloudBridgeAPI;

    async onload() {
        await this.loadSettings();

        this.api = {
            runQuery: this.runQuery.bind(this)
        };

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

    parseQuery(source: string): { [key: string]: any } {
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
                const listMatch = trimmedLine.match(/^-\s*(\w+):\s*(.+)$/);
                if (listMatch) {
                    params['filter'].push({ [listMatch[1]]: listMatch[2].trim() });
                    return;
                }
                if (!line.startsWith(' ') && !line.startsWith('\t') && !trimmedLine.startsWith('-')) {
                    currentSection = '';
                }
            }

            if (currentSection === '') {
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
        return params;
    }

    async runQuery(queryText: string): Promise<string[]> {
        const params = this.parseQuery(queryText);
        if (params['command'] !== 'List Files') {
            throw new Error('Unknown command or missing parameters.');
        }
        return await this.fetchFiles(params['folder'] || '/', params['filter'], params['format']);
    }

    async processNextcloudBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const params = this.parseQuery(source);

        if (params['command'] === 'List Files') {
            try {
                const results = await this.fetchFiles(params['folder'] || '/', params['filter'], params['format']);
                const ul = el.createEl('ul');
                if (params['list-style'] === 'none') {
                    ul.addClass('nextcloud-no-bullets');
                }

                if (results.length === 0) {
                    el.createEl('p', { text: 'No files found matching criteria.' });
                } else {
                    results.forEach(result => {
                        ul.createEl('li').setText(result);
                    });
                }
            } catch (error) {
                el.createEl('p', { text: `Error: ${error.message}` });
            }
        } else {
            el.createEl('p', { text: 'Unknown command or missing parameters.' });
        }
    }

    async fetchFiles(folder: string, filters: any[], format: string): Promise<string[]> {
        if (!this.settings.nextcloudUrl || !this.settings.username || !this.settings.password) {
            throw new Error('Please configure Nextcloud credentials in settings.');
        }

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

            const results: string[] = [];

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
                    if (filters && filters.length > 0) {
                        let match = true;
                        for (const filter of filters) {
                            if (filter.extension) {
                                const ext = name.split('.').pop();
                                const allowedExts = filter.extension.split(',').map((e: string) => e.trim().toLowerCase());
                                if (!ext || !allowedExts.includes(ext.toLowerCase())) {
                                    match = false;
                                    break;
                                }
                            }
                        }
                        if (!match) return;
                    }

                    if (format) {
                        const ext = name.includes('.') ? name.split('.').pop() || '' : '';
                        const filename = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;

                        let formatted = format
                            .replace(/{{name}}/g, name)
                            .replace(/{{filename}}/g, filename)
                            .replace(/{{ext}}/g, ext);

                        results.push(formatted);
                    } else {
                        results.push(name);
                    }
                }
            });

            return results;

        } else {
            throw new Error(`Server returned status ${response.status}`);
        }
    }
}
