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

    parseRelativeDate(dateString: string): Date {
        const trimmed = dateString.trim();
        
        // Check for "now" keyword
        if (trimmed.toLowerCase() === 'now') {
            return new Date();
        }
        
        // Check for arithmetic expressions: "now - 10 days" or "2025-10-10 + 5 hours"
        const arithmeticMatch = trimmed.match(/^(.+?)\s*([+-])\s*(\d+)\s*(second|minute|hour|day|week|month|year)s?$/i);
        if (arithmeticMatch) {
            const [, baseDateStr, operator, amount, unit] = arithmeticMatch;
            const value = parseInt(amount);
            const multiplier = operator === '+' ? 1 : -1;
            
            // Parse base date (could be "now" or an absolute date)
            let baseDate: Date;
            if (baseDateStr.trim().toLowerCase() === 'now') {
                baseDate = new Date();
            } else {
                baseDate = new Date(baseDateStr.trim());
            }
            
            // Apply the arithmetic operation
            switch (unit.toLowerCase()) {
                case 'second':
                    baseDate.setSeconds(baseDate.getSeconds() + (value * multiplier));
                    break;
                case 'minute':
                    baseDate.setMinutes(baseDate.getMinutes() + (value * multiplier));
                    break;
                case 'hour':
                    baseDate.setHours(baseDate.getHours() + (value * multiplier));
                    break;
                case 'day':
                    baseDate.setDate(baseDate.getDate() + (value * multiplier));
                    break;
                case 'week':
                    baseDate.setDate(baseDate.getDate() + (value * 7 * multiplier));
                    break;
                case 'month':
                    baseDate.setMonth(baseDate.getMonth() + (value * multiplier));
                    break;
                case 'year':
                    baseDate.setFullYear(baseDate.getFullYear() + (value * multiplier));
                    break;
            }
            return baseDate;
        }
        
        // Fall back to standard date parsing for absolute dates
        return new Date(trimmed);
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

        const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
    <d:prop>
        <d:displayname/>
        <d:getlastmodified/>
        <d:getcontentlength/>
        <d:getcontenttype/>
        <d:resourcetype/>
        <d:creationdate/>
        <oc:size/>
        <oc:favorite/>
        <oc:tags/>
        <oc:owner-display-name/>
        <oc:fileid/>
        <nc:has-preview/>
    </d:prop>
</d:propfind>`;

        const response = await requestUrl({
            url: url,
            method: 'PROPFIND',
            headers: {
                'Authorization': 'Basic ' + btoa(this.settings.username + ':' + this.settings.password),
                'Depth': '1',
                'Content-Type': 'application/xml'
            },
            body: propfindBody
        });

        if (response.status >= 200 && response.status < 300) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.text, "text/xml");
            const responses = xmlDoc.querySelectorAll('response');

            const results: string[] = [];

            responses.forEach(resp => {
                const href = resp.querySelector('href')?.textContent;
                const propstat = resp.querySelector('propstat prop');
                
                if (!href || !propstat) return;

                const decodedHref = decodeURIComponent(href);
                const cleanHref = decodedHref.endsWith('/') ? decodedHref.slice(0, -1) : decodedHref;
                const cleanRequestedFolder = cleanFolder.endsWith('/') ? cleanFolder.slice(0, -1) : cleanFolder;

                if (cleanHref.endsWith(cleanRequestedFolder)) {
                    return;
                }

                // Extract filepath - get the path after the base WebDAV URL
                let filepath = decodedHref;
                // Try to extract relative path from the full href
                const baseUrlPath = '/remote.php/dav/files/';
                const baseIndex = filepath.indexOf(baseUrlPath);
                if (baseIndex !== -1) {
                    // Skip past /remote.php/dav/files/username/
                    const afterBase = filepath.substring(baseIndex + baseUrlPath.length);
                    const parts = afterBase.split('/');
                    if (parts.length > 1) {
                        // Remove username part and keep the rest
                        filepath = '/' + parts.slice(1).join('/');
                    }
                }

                // Extract all properties
                const displayName = propstat.querySelector('displayname')?.textContent || '';
                let name = displayName;
                if (!name && href) {
                    const parts = href.split('/').filter(p => p);
                    name = parts[parts.length - 1];
                }
                if (!name) return;

                const lastModified = propstat.querySelector('getlastmodified')?.textContent || '';
                const contentLength = propstat.querySelector('getcontentlength')?.textContent || '0';
                const contentType = propstat.querySelector('getcontenttype')?.textContent || '';
                const resourceType = propstat.querySelector('resourcetype collection') ? 'folder' : 'file';
                const creationDate = propstat.querySelector('creationdate')?.textContent || '';
                const size = propstat.querySelector('size')?.textContent || contentLength;
                const favorite = propstat.querySelector('favorite')?.textContent === '1';
                const tagsElements = propstat.querySelectorAll('tags tag');
                const tags: string[] = [];
                tagsElements.forEach(tag => {
                    const tagText = tag.textContent;
                    if (tagText) tags.push(tagText);
                });
                const owner = propstat.querySelector('owner-display-name')?.textContent || '';
                const fileId = propstat.querySelector('fileid')?.textContent || '';
                const hasPreview = propstat.querySelector('has-preview')?.textContent === 'true';

                // Apply filters
                if (filters && filters.length > 0) {
                    let match = true;
                    for (const filter of filters) {
                        // Extension filter
                        if (filter.extension) {
                            const ext = name.split('.').pop();
                            const allowedExts = filter.extension.split(',').map((e: string) => e.trim().toLowerCase());
                            if (!ext || !allowedExts.includes(ext.toLowerCase())) {
                                match = false;
                                break;
                            }
                        }

                        // Type filter (file or folder)
                        if (filter.type) {
                            const filterType = filter.type.toLowerCase();
                            if (filterType !== resourceType) {
                                match = false;
                                break;
                            }
                        }

                        // Size filters (min/max in bytes)
                        if (filter.minsize) {
                            const minSize = parseInt(filter.minsize);
                            if (parseInt(size) < minSize) {
                                match = false;
                                break;
                            }
                        }
                        if (filter.maxsize) {
                            const maxSize = parseInt(filter.maxsize);
                            if (parseInt(size) > maxSize) {
                                match = false;
                                break;
                            }
                        }

                        // Favorite filter
                        if (filter.favorite !== undefined) {
                            const filterFavorite = filter.favorite === '1' || filter.favorite === 'true';
                            if (favorite !== filterFavorite) {
                                match = false;
                                break;
                            }
                        }

                        // MIME type filter
                        if (filter.mimetype) {
                            const filterMimes = filter.mimetype.split(',').map((m: string) => m.trim().toLowerCase());
                            if (!filterMimes.includes(contentType.toLowerCase())) {
                                match = false;
                                break;
                            }
                        }

                        // Tag filter
                        if (filter.tag) {
                            const filterTags = filter.tag.split(',').map((t: string) => t.trim().toLowerCase());
                            const hasMatchingTag = filterTags.some((ft: string) => 
                                tags.some((t: string) => t.toLowerCase().includes(ft))
                            );
                            if (!hasMatchingTag) {
                                match = false;
                                break;
                            }
                        }

                        // Owner filter
                        if (filter.owner) {
                            if (!owner.toLowerCase().includes(filter.owner.toLowerCase())) {
                                match = false;
                                break;
                            }
                        }

                        // Date filters
                        if (filter.modifiedafter || filter.modifiedbefore) {
                            const fileDate = new Date(lastModified);
                            
                            if (filter.modifiedafter) {
                                const afterDate = this.parseRelativeDate(filter.modifiedafter);
                                if (fileDate <= afterDate) {
                                    match = false;
                                    break;
                                }
                            }
                            
                            if (filter.modifiedbefore) {
                                const beforeDate = this.parseRelativeDate(filter.modifiedbefore);
                                if (fileDate >= beforeDate) {
                                    match = false;
                                    break;
                                }
                            }
                        }

                        // Has preview filter
                        if (filter.haspreview !== undefined) {
                            const filterPreview = filter.haspreview === '1' || filter.haspreview === 'true';
                            if (hasPreview !== filterPreview) {
                                match = false;
                                break;
                            }
                        }
                    }
                    if (!match) return;
                }

                // Format output
                if (format) {
                    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
                    const filename = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;
                    const sizeKB = (parseInt(size) / 1024).toFixed(2);
                    const sizeMB = (parseInt(size) / (1024 * 1024)).toFixed(2);
                    const dateObj = lastModified ? new Date(lastModified) : null;
                    const dateFormatted = dateObj ? dateObj.toLocaleDateString() : '';
                    const dateTimeFormatted = dateObj ? dateObj.toLocaleString() : '';
                    
                    let formatted = format
                        .replace(/{{name}}/g, name)
                        .replace(/{{filename}}/g, filename)
                        .replace(/{{ext}}/g, ext)
                        .replace(/{{size}}/g, size)
                        .replace(/{{sizekb}}/g, sizeKB)
                        .replace(/{{sizemb}}/g, sizeMB)
                        .replace(/{{type}}/g, resourceType)
                        .replace(/{{mimetype}}/g, contentType)
                        .replace(/{{date}}/g, dateFormatted)
                        .replace(/{{datetime}}/g, dateTimeFormatted)
                        .replace(/{{modified}}/g, lastModified)
                        .replace(/{{created}}/g, creationDate)
                        .replace(/{{favorite}}/g, favorite ? '⭐' : '')
                        .replace(/{{tags}}/g, tags.join(', '))
                        .replace(/{{owner}}/g, owner)
                        .replace(/{{fileid}}/g, fileId)
                        .replace(/{{preview}}/g, hasPreview ? '📷' : '')
                        .replace(/{{path}}/g, filepath);

                    results.push(formatted);
                } else {
                    results.push(name);
                }
            });

            return results;

        } else {
            throw new Error(`Server returned status ${response.status}`);
        }
    }
}
